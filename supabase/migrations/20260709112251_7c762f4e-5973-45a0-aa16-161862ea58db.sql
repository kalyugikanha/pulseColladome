-- 1) Rename profiles department "Designing" -> "Design"
UPDATE public.profiles SET department = 'Design' WHERE department = 'Designing';

-- 2) Recreate create_task_full without _domain_id / domain_id
DROP FUNCTION IF EXISTS public.create_task_full(uuid, text, text, date, public.task_priority, uuid, jsonb, uuid, uuid, uuid[], numeric);

CREATE OR REPLACE FUNCTION public.create_task_full(
  _project_id uuid,
  _title text,
  _description text DEFAULT NULL,
  _due_date date DEFAULT NULL,
  _priority public.task_priority DEFAULT 'medium',
  _assignee_id uuid DEFAULT auth.uid(),
  _asset_links jsonb DEFAULT '[]'::jsonb,
  _department_id uuid DEFAULT NULL,
  _task_type_ids uuid[] DEFAULT ARRAY[]::uuid[],
  _estimated_hours numeric DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _task public.tasks;
  _task_type_id uuid;
  _uid uuid := auth.uid();
  _assignee uuid := COALESCE(_assignee_id, auth.uid());
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to create tasks.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NULLIF(trim(_title), '') IS NULL THEN
    RAISE EXCEPTION 'Task title is required.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.profiles (id, full_name, email)
  SELECT u.id,
         COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email,'@',1)),
         u.email
  FROM auth.users u
  WHERE u.id = _uid
  ON CONFLICT (id) DO NOTHING;

  IF _assignee IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, email)
    SELECT u.id,
           COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email,'@',1)),
           u.email
    FROM auth.users u
    WHERE u.id = _assignee
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.tasks (
    project_id, title, description, due_date, priority, status,
    assignee_id, created_by, asset_links, department_id, estimated_hours
  ) VALUES (
    _project_id,
    trim(_title),
    NULLIF(_description, ''),
    _due_date,
    COALESCE(_priority, 'medium'),
    'todo',
    _assignee,
    _uid,
    COALESCE(_asset_links, '[]'::jsonb),
    _department_id,
    _estimated_hours
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
$function$;

-- 3) Recreate generate_recurring_task_occurrences without domain_id
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

-- 4) Drop the three unused columns
ALTER TABLE public.tasks
  DROP COLUMN IF EXISTS origin_department,
  DROP COLUMN IF EXISTS domain_id,
  DROP COLUMN IF EXISTS client_brand;
