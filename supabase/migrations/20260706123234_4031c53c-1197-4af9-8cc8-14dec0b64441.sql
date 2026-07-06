
-- 1) Add profile FKs on task_templates so PostgREST embeds resolve to public.profiles
ALTER TABLE public.task_templates
  ADD CONSTRAINT task_templates_default_assignee_profile_fkey
  FOREIGN KEY (default_assignee_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.task_templates
  ADD CONSTRAINT task_templates_created_by_profile_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2) Patch create_task_full to backfill missing profile rows for assignee (self-heal FK)
CREATE OR REPLACE FUNCTION public.create_task_full(
  _project_id uuid,
  _title text,
  _description text DEFAULT NULL::text,
  _due_date date DEFAULT NULL::date,
  _priority task_priority DEFAULT 'medium'::task_priority,
  _assignee_id uuid DEFAULT auth.uid(),
  _asset_links jsonb DEFAULT '[]'::jsonb,
  _domain_id uuid DEFAULT NULL::uuid,
  _department_id uuid DEFAULT NULL::uuid,
  _task_type_ids uuid[] DEFAULT ARRAY[]::uuid[]
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

  -- Backfill profile row for creator if missing (satisfies tasks_created_by_fkey/profiles refs)
  INSERT INTO public.profiles (id, full_name, email)
  SELECT u.id,
         COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email,'@',1)),
         u.email
  FROM auth.users u
  WHERE u.id = _uid
  ON CONFLICT (id) DO NOTHING;

  -- Backfill profile row for assignee if missing
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
    assignee_id, created_by, asset_links, domain_id, department_id
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
$function$;

REVOKE ALL ON FUNCTION public.create_task_full(uuid, text, text, date, task_priority, uuid, jsonb, uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_task_full(uuid, text, text, date, task_priority, uuid, jsonb, uuid, uuid, uuid[]) TO authenticated, service_role;
