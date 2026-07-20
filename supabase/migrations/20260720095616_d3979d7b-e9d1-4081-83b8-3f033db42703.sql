CREATE OR REPLACE FUNCTION public.generate_recurring_task_occurrences()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t record;
  today date := current_date;
  dow int := EXTRACT(ISODOW FROM current_date)::int;
  matches boolean;
  new_task_id uuid;
BEGIN
  -- Never generate occurrences on non-working days (Sun, 2nd/4th Sat, holidays).
  IF public.is_non_working_day(today) THEN
    RETURN;
  END IF;

  FOR t IN
    SELECT * FROM public.tasks WHERE is_recurring_template = true
  LOOP
    matches := false;
    IF t.recurrence_freq = 'daily' THEN
      matches := true;
    ELSIF t.recurrence_freq = 'weekly' AND t.recurrence_days IS NOT NULL THEN
      matches := dow = ANY(t.recurrence_days);
    END IF;
    IF NOT matches THEN CONTINUE; END IF;

    -- Idempotency guard: skip when an occurrence already exists (or existed and was
    -- deleted) for this template + date. Without this, deleting today's occurrence
    -- would cause it to be silently re-created on the next board/list load.
    IF EXISTS (
      SELECT 1 FROM public.tasks
      WHERE recurrence_parent_id = t.id AND due_date = today
    ) THEN
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.tasks (
        project_id, title, description, priority, status,
        assignee_id, created_by, asset_links, department_id,
        estimated_hours, due_date, recurrence_parent_id
      ) VALUES (
        t.project_id, t.title, t.description, t.priority, 'todo',
        t.assignee_id, t.created_by, COALESCE(t.asset_links,'[]'::jsonb),
        t.department_id, t.estimated_hours, today, t.id
      )
      RETURNING id INTO new_task_id;

      INSERT INTO public.task_task_types (task_id, task_type_id)
      SELECT new_task_id, tt.task_type_id
      FROM public.task_task_types tt WHERE tt.task_id = t.id
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
END;
$function$;