CREATE OR REPLACE FUNCTION public.can_manage_task_taxonomy(_task_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = _task_id
      AND (
        private.can_manage_projects(_user_id)
        OR private.is_admin(_user_id)
        OR private.is_hr_admin(_user_id)
        OR private.is_super_admin(_user_id)
        OR t.assignee_id = _user_id
        OR t.created_by = _user_id
        OR (t.assignee_id IS NOT NULL AND private.is_reporting_manager_of(_user_id, t.assignee_id))
        OR (t.assignee_id IS NOT NULL AND private.is_head_of_user(_user_id, t.assignee_id))
      )
  );
$$;

DROP POLICY IF EXISTS "ttt: read via task" ON public.task_task_types;
DROP POLICY IF EXISTS "ttt: write via task" ON public.task_task_types;

CREATE POLICY "ttt: read via task"
ON public.task_task_types
FOR SELECT
TO authenticated
USING (public.can_view_task(task_id));

CREATE POLICY "ttt: write via task"
ON public.task_task_types
FOR ALL
TO authenticated
USING (public.can_manage_task_taxonomy(task_id, auth.uid()))
WITH CHECK (public.can_manage_task_taxonomy(task_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.create_task_full(
  _project_id uuid,
  _title text,
  _description text DEFAULT NULL,
  _due_date date DEFAULT NULL,
  _priority public.task_priority DEFAULT 'medium',
  _assignee_id uuid DEFAULT auth.uid(),
  _asset_links jsonb DEFAULT '[]'::jsonb,
  _domain_id uuid DEFAULT NULL,
  _department_id uuid DEFAULT NULL,
  _task_type_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _task public.tasks;
  _task_type_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to create tasks.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NULLIF(trim(_title), '') IS NULL THEN
    RAISE EXCEPTION 'Task title is required.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.tasks (
    project_id,
    title,
    description,
    due_date,
    priority,
    status,
    assignee_id,
    created_by,
    asset_links,
    domain_id,
    department_id
  ) VALUES (
    _project_id,
    trim(_title),
    NULLIF(_description, ''),
    _due_date,
    COALESCE(_priority, 'medium'),
    'todo',
    COALESCE(_assignee_id, auth.uid()),
    auth.uid(),
    COALESCE(_asset_links, '[]'::jsonb),
    _domain_id,
    _department_id
  )
  RETURNING * INTO _task;

  IF COALESCE(array_length(_task_type_ids, 1), 0) > 0 THEN
    FOREACH _task_type_id IN ARRAY _task_type_ids LOOP
      INSERT INTO public.task_task_types (task_id, task_type_id)
      VALUES (_task.id, _task_type_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN _task;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_task_taxonomy(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_task_full(uuid, text, text, date, public.task_priority, uuid, jsonb, uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_task_taxonomy(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_task_full(uuid, text, text, date, public.task_priority, uuid, jsonb, uuid, uuid, uuid[]) TO service_role;