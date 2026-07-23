
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence_day_of_month int
  CHECK (recurrence_day_of_month IS NULL OR (recurrence_day_of_month BETWEEN 1 AND 31));

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
  last_dom int := EXTRACT(DAY FROM (date_trunc('month', current_date) + interval '1 month - 1 day'))::int;
  effective_dom int;
  matches boolean;
  new_task_id uuid;
BEGIN
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
    ELSIF t.recurrence_freq = 'monthly' AND t.recurrence_day_of_month IS NOT NULL THEN
      effective_dom := LEAST(t.recurrence_day_of_month, last_dom);
      matches := EXTRACT(DAY FROM today)::int = effective_dom;
    END IF;
    IF NOT matches THEN CONTINUE; END IF;

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

      IF t.reviewer_id IS NOT NULL THEN
        UPDATE public.tasks
           SET reviewer_id = t.reviewer_id
         WHERE id = new_task_id;
      END IF;

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

CREATE OR REPLACE FUNCTION public.tasks_auto_reviewer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  mgr_id uuid;
  fallback_id uuid;
BEGIN
  -- Never clobber an explicitly-set reviewer (recurring gen, workflow stages, edits).
  IF NEW.reviewer_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.assignee_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Default: creator becomes reviewer (unless self-assigned).
  IF NEW.created_by IS NOT NULL AND NEW.created_by <> NEW.assignee_id THEN
    NEW.reviewer_id := NEW.created_by;
    RETURN NEW;
  END IF;

  -- Fallback: assignee's reporting manager.
  SELECT reporting_manager_id INTO mgr_id
  FROM public.profiles WHERE id = NEW.assignee_id;

  IF mgr_id IS NOT NULL AND mgr_id <> NEW.assignee_id THEN
    NEW.reviewer_id := mgr_id;
    RETURN NEW;
  END IF;

  -- Final fallback: first super admin.
  SELECT user_id INTO fallback_id
  FROM public.super_admins
  WHERE user_id <> NEW.assignee_id
  ORDER BY user_id
  LIMIT 1;

  IF fallback_id IS NOT NULL THEN
    NEW.reviewer_id := fallback_id;
  END IF;

  RETURN NEW;
END;
$function$;
