
CREATE OR REPLACE FUNCTION public.sync_learning_tasks(_course_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _project_id uuid;
  _task_type_id uuid;
  _course record;
  _uid uuid;
  _new_task_id uuid;
  _admin_id uuid;
  _learning_admin_id uuid;
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

  -- Route all learning-task reviews to a Learning Admin (not the assignee's
  -- reporting manager, which the trg_tasks_auto_reviewer trigger would pick).
  SELECT ur.user_id INTO _learning_admin_id
    FROM public.user_roles ur
   WHERE ur.role = 'learning_admin'
   ORDER BY ur.created_at NULLS LAST
   LIMIT 1;

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

      -- Overwrite the reviewer set by trg_tasks_auto_reviewer. We update only
      -- reviewer_id (not assignee_id) so the auto-reviewer trigger — which is
      -- scoped to UPDATE OF assignee_id — does not re-fire and clobber this.
      IF _learning_admin_id IS NOT NULL THEN
        UPDATE public.tasks
           SET reviewer_id = _learning_admin_id
         WHERE id = _new_task_id;
      END IF;

      INSERT INTO public.course_assignment_tasks (course_id, user_id, task_id)
        VALUES (_course.id, _uid, _new_task_id);
    END LOOP;
  END LOOP;
END;
$function$;
