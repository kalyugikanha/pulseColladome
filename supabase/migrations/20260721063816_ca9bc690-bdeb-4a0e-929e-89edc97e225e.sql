
ALTER TABLE public.course_submissions DROP CONSTRAINT IF EXISTS course_submissions_course_id_user_id_key;

INSERT INTO public.projects (name, code, status, description)
SELECT 'Learning', 'LEARN', 'active', 'System project for course assignments — do not delete.'
WHERE NOT EXISTS (SELECT 1 FROM public.projects WHERE code = 'LEARN');

INSERT INTO public.taxonomy_task_types (name, department_id, active)
SELECT 'Learning', NULL, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.taxonomy_task_types WHERE lower(name) = 'learning' AND department_id IS NULL
);

CREATE TABLE IF NOT EXISTS public.course_assignment_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_assignment_tasks TO authenticated;
GRANT ALL ON public.course_assignment_tasks TO service_role;

ALTER TABLE public.course_assignment_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cat: learner sees own"
  ON public.course_assignment_tasks FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR private.is_admin(auth.uid())
    OR private.is_hr_admin(auth.uid())
    OR private.is_learning_admin(auth.uid())
  );

CREATE POLICY "cat: admins manage"
  ON public.course_assignment_tasks FOR ALL
  TO authenticated
  USING (
    private.is_admin(auth.uid())
    OR private.is_learning_admin(auth.uid())
  )
  WITH CHECK (
    private.is_admin(auth.uid())
    OR private.is_learning_admin(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.sync_learning_tasks(_course_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _project_id uuid;
  _task_type_id uuid;
  _course record;
  _uid uuid;
  _new_task_id uuid;
  _admin_id uuid;
BEGIN
  SELECT id INTO _project_id FROM public.projects WHERE code = 'LEARN' LIMIT 1;
  IF _project_id IS NULL THEN
    RAISE EXCEPTION 'Learning project (code=LEARN) missing';
  END IF;

  SELECT id INTO _task_type_id
    FROM public.taxonomy_task_types
    WHERE lower(name) = 'learning' AND department_id IS NULL AND active = true
    LIMIT 1;

  SELECT user_id INTO _admin_id FROM public.user_roles WHERE role = 'admin' ORDER BY created_at NULLS LAST LIMIT 1;

  FOR _course IN
    SELECT * FROM public.courses
    WHERE _course_id IS NULL OR id = _course_id
  LOOP
    UPDATE public.tasks t
       SET due_date = _course.due_date, updated_at = now()
      FROM public.course_assignment_tasks cat
     WHERE cat.task_id = t.id
       AND cat.course_id = _course.id
       AND t.due_date IS DISTINCT FROM _course.due_date;

    FOR _uid IN
      SELECT DISTINCT audience_user FROM (
        SELECT ct.user_id AS audience_user
          FROM public.course_targets ct
         WHERE ct.course_id = _course.id AND ct.user_id IS NOT NULL
        UNION
        SELECT p.id
          FROM public.course_targets ct
          JOIN public.profiles p ON p.department = ct.department
         WHERE ct.course_id = _course.id
           AND ct.department IS NOT NULL
           AND COALESCE(p.is_active, true) = true
           AND COALESCE(p.is_placeholder, false) = false
      ) src
      WHERE audience_user IS NOT NULL
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.course_assignment_tasks
        WHERE course_id = _course.id AND user_id = _uid
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.tasks (
        project_id, title, description, due_date, priority, status,
        assignee_id, created_by, asset_links
      ) VALUES (
        _project_id,
        'Learning: ' || _course.title,
        COALESCE(_course.description, '') ||
          CASE WHEN _course.resource_url IS NOT NULL THEN E'\n\nResource: ' || _course.resource_url ELSE '' END,
        _course.due_date,
        'medium',
        'todo',
        _uid,
        COALESCE(_course.created_by, _admin_id),
        '[]'::jsonb
      )
      RETURNING id INTO _new_task_id;

      IF _task_type_id IS NOT NULL THEN
        INSERT INTO public.task_task_types (task_id, task_type_id)
          VALUES (_new_task_id, _task_type_id)
          ON CONFLICT DO NOTHING;
      END IF;

      INSERT INTO public.course_assignment_tasks (course_id, user_id, task_id)
        VALUES (_course.id, _uid, _new_task_id);
    END LOOP;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_learning_tasks(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_course_submission_task_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task_id uuid;
  _latest_status text;
BEGIN
  SELECT task_id INTO _task_id
    FROM public.course_assignment_tasks
   WHERE course_id = NEW.course_id AND user_id = NEW.user_id;

  IF _task_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO _latest_status
    FROM public.course_submissions
   WHERE course_id = NEW.course_id AND user_id = NEW.user_id
   ORDER BY submitted_at DESC
   LIMIT 1;

  IF _latest_status = 'approved' THEN
    UPDATE public.tasks
       SET status = 'done', completion_percent = 100, updated_at = now()
     WHERE id = _task_id;
  ELSIF _latest_status = 'submitted' THEN
    UPDATE public.tasks
       SET status = 'review', updated_at = now()
     WHERE id = _task_id;
  ELSIF _latest_status = 'rejected' THEN
    UPDATE public.tasks
       SET status = 'in_progress', updated_at = now()
     WHERE id = _task_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_course_submission_task_sync ON public.course_submissions;
CREATE TRIGGER trg_course_submission_task_sync
AFTER INSERT OR UPDATE ON public.course_submissions
FOR EACH ROW EXECUTE FUNCTION public.handle_course_submission_task_sync();
