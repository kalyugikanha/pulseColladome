
-- Enums
DO $$ BEGIN
  CREATE TYPE public.task_stage_kind AS ENUM ('work', 'internal_review', 'client_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_stage_status AS ENUM ('pending', 'active', 'in_review', 'changes_requested', 'done', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_multi_stage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_stage_id uuid NULL;

-- Stages table
CREATE TABLE IF NOT EXISTS public.task_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  position int NOT NULL,
  name text NOT NULL,
  kind public.task_stage_kind NOT NULL DEFAULT 'work',
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewer_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  status public.task_stage_status NOT NULL DEFAULT 'pending',
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  decision_note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, position)
);
CREATE INDEX IF NOT EXISTS task_stages_task_idx ON public.task_stages(task_id, position);
CREATE INDEX IF NOT EXISTS task_stages_owner_idx ON public.task_stages(owner_id) WHERE status IN ('active','in_review');
CREATE INDEX IF NOT EXISTS task_stages_reviewer_idx ON public.task_stages(reviewer_id) WHERE status = 'in_review';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_stages TO authenticated;
GRANT ALL ON public.task_stages TO service_role;

-- Stage events
CREATE TABLE IF NOT EXISTS public.task_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.task_stages(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_stage_events_stage_idx ON public.task_stage_events(stage_id, created_at DESC);
CREATE INDEX IF NOT EXISTS task_stage_events_task_idx ON public.task_stage_events(task_id, created_at DESC);

GRANT SELECT, INSERT ON public.task_stage_events TO authenticated;
GRANT ALL ON public.task_stage_events TO service_role;

-- FK for tasks.current_stage_id (deferred)
DO $$ BEGIN
  ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_current_stage_fkey FOREIGN KEY (current_stage_id)
    REFERENCES public.task_stages(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_task_stages_updated ON public.task_stages;
CREATE TRIGGER trg_task_stages_updated
  BEFORE UPDATE ON public.task_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Permission helper
CREATE OR REPLACE FUNCTION private.can_manage_task_stages(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND (
        t.created_by = _user_id
        OR t.assignee_id = _user_id
        OR private.is_admin(_user_id)
        OR private.is_super_admin(_user_id)
        OR private.is_hr_admin(_user_id)
        OR private.can_manage_projects(_user_id)
        OR (t.assignee_id IS NOT NULL AND private.is_reporting_manager_of(_user_id, t.assignee_id))
        OR (t.assignee_id IS NOT NULL AND private.is_head_of_user(_user_id, t.assignee_id))
      )
  );
$$;
REVOKE ALL ON FUNCTION private.can_manage_task_stages(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_manage_task_stages(uuid, uuid) TO authenticated, service_role;

-- RLS: task_stages
ALTER TABLE public.task_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stages_select" ON public.task_stages;
CREATE POLICY "stages_select" ON public.task_stages FOR SELECT TO authenticated
USING (
  public.can_view_task(task_id)
  OR owner_id = auth.uid()
  OR reviewer_id = auth.uid()
);

DROP POLICY IF EXISTS "stages_insert" ON public.task_stages;
CREATE POLICY "stages_insert" ON public.task_stages FOR INSERT TO authenticated
WITH CHECK (private.can_manage_task_stages(task_id, auth.uid()));

DROP POLICY IF EXISTS "stages_update" ON public.task_stages;
CREATE POLICY "stages_update" ON public.task_stages FOR UPDATE TO authenticated
USING (
  private.can_manage_task_stages(task_id, auth.uid())
  OR owner_id = auth.uid()
  OR reviewer_id = auth.uid()
)
WITH CHECK (
  private.can_manage_task_stages(task_id, auth.uid())
  OR owner_id = auth.uid()
  OR reviewer_id = auth.uid()
);

DROP POLICY IF EXISTS "stages_delete" ON public.task_stages;
CREATE POLICY "stages_delete" ON public.task_stages FOR DELETE TO authenticated
USING (private.can_manage_task_stages(task_id, auth.uid()));

-- RLS: task_stage_events
ALTER TABLE public.task_stage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stage_events_select" ON public.task_stage_events;
CREATE POLICY "stage_events_select" ON public.task_stage_events FOR SELECT TO authenticated
USING (public.can_view_task(task_id));

DROP POLICY IF EXISTS "stage_events_insert" ON public.task_stage_events;
CREATE POLICY "stage_events_insert" ON public.task_stage_events FOR INSERT TO authenticated
WITH CHECK (
  public.can_view_task(task_id) AND (actor_id IS NULL OR actor_id = auth.uid())
);

-- RPC: set_task_stages (replace the stage list)
CREATE OR REPLACE FUNCTION public.set_task_stages(_task_id uuid, _stages jsonb)
RETURNS SETOF public.task_stages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rec jsonb;
  _pos int := 0;
  _first_id uuid;
  _first_owner uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT private.can_manage_task_stages(_task_id, _uid) THEN
    RAISE EXCEPTION 'You do not have permission to edit this task''s workflow.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(_stages) <> 'array' OR jsonb_array_length(_stages) = 0 THEN
    RAISE EXCEPTION 'At least one stage is required.' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.task_stages WHERE task_id = _task_id;

  FOR _rec IN SELECT * FROM jsonb_array_elements(_stages) LOOP
    _pos := _pos + 1;
    INSERT INTO public.task_stages (task_id, position, name, kind, owner_id, reviewer_id, status, started_at)
    VALUES (
      _task_id,
      _pos,
      COALESCE(NULLIF(trim(_rec->>'name'), ''), 'Stage ' || _pos),
      COALESCE((_rec->>'kind')::public.task_stage_kind, 'work'),
      (_rec->>'owner_id')::uuid,
      NULLIF(_rec->>'reviewer_id','')::uuid,
      CASE WHEN _pos = 1 THEN 'active'::public.task_stage_status ELSE 'pending'::public.task_stage_status END,
      CASE WHEN _pos = 1 THEN now() ELSE NULL END
    );
  END LOOP;

  SELECT id, owner_id INTO _first_id, _first_owner
  FROM public.task_stages WHERE task_id = _task_id ORDER BY position LIMIT 1;

  UPDATE public.tasks
    SET is_multi_stage = true,
        current_stage_id = _first_id,
        assignee_id = _first_owner,
        status = 'in_progress'
    WHERE id = _task_id;

  INSERT INTO public.task_stage_events (stage_id, task_id, actor_id, kind, to_status, note)
    VALUES (_first_id, _task_id, _uid, 'started', 'active', 'Workflow started');

  INSERT INTO public.notifications (user_id, kind, task_id, body)
    SELECT _first_owner, 'stage_assigned', _task_id,
           'You have a new task stage to work on.'
    WHERE _first_owner IS NOT NULL AND _first_owner <> _uid;

  RETURN QUERY SELECT * FROM public.task_stages WHERE task_id = _task_id ORDER BY position;
END; $$;
REVOKE ALL ON FUNCTION public.set_task_stages(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_task_stages(uuid, jsonb) TO authenticated, service_role;

-- RPC: advance_task_stage
-- _action: submit | approve | reject | reassign
CREATE OR REPLACE FUNCTION public.advance_task_stage(_stage_id uuid, _action text, _note text DEFAULT NULL, _reassign_to uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _uid uuid := auth.uid();
  _s public.task_stages;
  _next public.task_stages;
  _prev public.task_stages;
  _task_id uuid;
  _is_manager boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO _s FROM public.task_stages WHERE id = _stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stage not found'; END IF;
  _task_id := _s.task_id;
  _is_manager := private.can_manage_task_stages(_task_id, _uid);

  IF _action = 'submit' THEN
    IF _s.owner_id <> _uid AND NOT _is_manager THEN
      RAISE EXCEPTION 'Only the stage owner can submit this stage.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF _s.status NOT IN ('active','changes_requested') THEN
      RAISE EXCEPTION 'Stage is not active.' USING ERRCODE = 'check_violation';
    END IF;

    -- Find next stage
    SELECT * INTO _next FROM public.task_stages
      WHERE task_id = _task_id AND position > _s.position
      ORDER BY position LIMIT 1;

    IF _next.id IS NOT NULL AND _next.kind IN ('internal_review','client_review') THEN
      -- Move current into review; reviewer of next stage owns the review
      UPDATE public.task_stages SET status = 'in_review' WHERE id = _s.id;
      UPDATE public.task_stages SET status = 'active', started_at = now() WHERE id = _next.id;
      UPDATE public.tasks SET current_stage_id = _next.id, assignee_id = _next.owner_id, status = 'review' WHERE id = _task_id;
      INSERT INTO public.task_stage_events (stage_id, task_id, actor_id, kind, from_status, to_status, note)
        VALUES (_s.id, _task_id, _uid, 'submitted', _s.status::text, 'in_review', _note);
      INSERT INTO public.notifications (user_id, kind, task_id, body)
        SELECT _next.owner_id, 'stage_review_requested', _task_id, 'A task stage is ready for your review.'
        WHERE _next.owner_id IS NOT NULL AND _next.owner_id <> _uid;
    ELSIF _next.id IS NOT NULL THEN
      UPDATE public.task_stages SET status = 'done', completed_at = now(), decision_note = _note WHERE id = _s.id;
      UPDATE public.task_stages SET status = 'active', started_at = now() WHERE id = _next.id;
      UPDATE public.tasks SET current_stage_id = _next.id, assignee_id = _next.owner_id, status = 'in_progress' WHERE id = _task_id;
      INSERT INTO public.task_stage_events (stage_id, task_id, actor_id, kind, from_status, to_status, note)
        VALUES (_s.id, _task_id, _uid, 'submitted', _s.status::text, 'done', _note);
      INSERT INTO public.notifications (user_id, kind, task_id, body)
        SELECT _next.owner_id, 'stage_assigned', _task_id, 'A task stage was handed to you.'
        WHERE _next.owner_id IS NOT NULL AND _next.owner_id <> _uid;
    ELSE
      -- No next stage → complete task
      UPDATE public.task_stages SET status = 'done', completed_at = now(), decision_note = _note WHERE id = _s.id;
      UPDATE public.tasks SET current_stage_id = NULL, status = 'done', completion_percent = 100 WHERE id = _task_id;
      INSERT INTO public.task_stage_events (stage_id, task_id, actor_id, kind, from_status, to_status, note)
        VALUES (_s.id, _task_id, _uid, 'submitted', _s.status::text, 'done', _note);
    END IF;

  ELSIF _action = 'approve' THEN
    IF _s.status <> 'active' OR _s.kind NOT IN ('internal_review','client_review') THEN
      RAISE EXCEPTION 'Only an active review stage can be approved.' USING ERRCODE = 'check_violation';
    END IF;
    IF _s.owner_id <> _uid AND NOT _is_manager THEN
      RAISE EXCEPTION 'Only the reviewer can approve this stage.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Mark previous 'in_review' stage as done as well
    UPDATE public.task_stages
      SET status = 'done', completed_at = now()
      WHERE task_id = _task_id AND status = 'in_review' AND position < _s.position;

    SELECT * INTO _next FROM public.task_stages
      WHERE task_id = _task_id AND position > _s.position ORDER BY position LIMIT 1;

    UPDATE public.task_stages SET status = 'done', completed_at = now(), decision_note = _note WHERE id = _s.id;

    IF _next.id IS NOT NULL THEN
      UPDATE public.task_stages SET status = 'active', started_at = now() WHERE id = _next.id;
      UPDATE public.tasks SET current_stage_id = _next.id, assignee_id = _next.owner_id,
        status = CASE WHEN _next.kind IN ('internal_review','client_review') THEN 'review' ELSE 'in_progress' END
        WHERE id = _task_id;
      INSERT INTO public.notifications (user_id, kind, task_id, body)
        SELECT _next.owner_id, 'stage_assigned', _task_id, 'Task approved — next stage is yours.'
        WHERE _next.owner_id IS NOT NULL AND _next.owner_id <> _uid;
    ELSE
      UPDATE public.tasks SET current_stage_id = NULL, status = 'done', completion_percent = 100 WHERE id = _task_id;
    END IF;

    INSERT INTO public.task_stage_events (stage_id, task_id, actor_id, kind, from_status, to_status, note)
      VALUES (_s.id, _task_id, _uid, 'approved', 'active', 'done', _note);

  ELSIF _action = 'reject' THEN
    IF _s.status <> 'active' OR _s.kind NOT IN ('internal_review','client_review') THEN
      RAISE EXCEPTION 'Only an active review stage can be rejected.' USING ERRCODE = 'check_violation';
    END IF;
    IF _s.owner_id <> _uid AND NOT _is_manager THEN
      RAISE EXCEPTION 'Only the reviewer can reject this stage.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF _note IS NULL OR trim(_note) = '' THEN
      RAISE EXCEPTION 'A note is required when sending a stage back.' USING ERRCODE = 'check_violation';
    END IF;

    -- Find previous non-review stage
    SELECT * INTO _prev FROM public.task_stages
      WHERE task_id = _task_id AND position < _s.position AND kind = 'work'
      ORDER BY position DESC LIMIT 1;
    IF _prev.id IS NULL THEN
      SELECT * INTO _prev FROM public.task_stages
        WHERE task_id = _task_id AND position < _s.position
        ORDER BY position DESC LIMIT 1;
    END IF;
    IF _prev.id IS NULL THEN
      RAISE EXCEPTION 'No previous stage to send back to.' USING ERRCODE = 'check_violation';
    END IF;

    -- Reset all stages from _prev to _s
    UPDATE public.task_stages
      SET status = 'pending', started_at = NULL, completed_at = NULL
      WHERE task_id = _task_id AND position > _prev.position AND position <= _s.position;

    UPDATE public.task_stages
      SET status = 'changes_requested', started_at = now(), decision_note = _note
      WHERE id = _prev.id;

    UPDATE public.tasks
      SET current_stage_id = _prev.id, assignee_id = _prev.owner_id, status = 'in_progress'
      WHERE id = _task_id;

    INSERT INTO public.task_stage_events (stage_id, task_id, actor_id, kind, from_status, to_status, note)
      VALUES (_s.id, _task_id, _uid, 'rejected', 'active', 'changes_requested', _note);
    INSERT INTO public.task_stage_events (stage_id, task_id, actor_id, kind, to_status, note)
      VALUES (_prev.id, _task_id, _uid, 'reassigned', 'changes_requested', _note);

    -- Add comment for context
    INSERT INTO public.task_comments (task_id, author_id, body)
      VALUES (_task_id, _uid, '↩️ Sent back at "' || _s.name || '": ' || _note);

    INSERT INTO public.notifications (user_id, kind, task_id, body)
      SELECT _prev.owner_id, 'stage_rejected', _task_id,
             'Changes requested at "' || _s.name || '": ' || _note
      WHERE _prev.owner_id IS NOT NULL AND _prev.owner_id <> _uid;

  ELSIF _action = 'reassign' THEN
    IF NOT _is_manager THEN
      RAISE EXCEPTION 'Only a task manager can reassign a stage.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF _reassign_to IS NULL THEN
      RAISE EXCEPTION 'New owner required.' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.task_stages SET owner_id = _reassign_to WHERE id = _s.id;
    IF _s.status IN ('active','changes_requested') THEN
      UPDATE public.tasks SET assignee_id = _reassign_to WHERE id = _task_id AND current_stage_id = _s.id;
    END IF;
    INSERT INTO public.task_stage_events (stage_id, task_id, actor_id, kind, from_status, to_status, note)
      VALUES (_s.id, _task_id, _uid, 'reassigned', _s.status::text, _s.status::text,
              COALESCE(_note, 'Owner changed'));
    INSERT INTO public.notifications (user_id, kind, task_id, body)
      VALUES (_reassign_to, 'stage_assigned', _task_id, 'A task stage was assigned to you.');
  ELSE
    RAISE EXCEPTION 'Unknown action: %', _action USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object('ok', true, 'task_id', _task_id);
END; $$;
REVOKE ALL ON FUNCTION public.advance_task_stage(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_task_stage(uuid, text, text, uuid) TO authenticated, service_role;
