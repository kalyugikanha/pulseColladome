
-- Enable realtime for notifications (idempotent)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- RPC: create a task request that notifies the caller's manager
CREATE OR REPLACE FUNCTION public.request_task_from_manager(
  _title text,
  _project_id uuid DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _me record;
  _recipient uuid;
  _project_name text;
  _requester_name text;
  _body text;
  _notif_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NULLIF(trim(_title), '') IS NULL THEN
    RAISE EXCEPTION 'Task title is required.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, full_name, email, department, reporting_manager_id
    INTO _me FROM public.profiles WHERE id = _uid;

  _recipient := _me.reporting_manager_id;

  IF _recipient IS NULL AND _me.department IS NOT NULL THEN
    SELECT user_id INTO _recipient
      FROM public.department_heads
      WHERE department = _me.department
      LIMIT 1;
  END IF;

  IF _recipient IS NULL THEN
    SELECT user_id INTO _recipient
      FROM public.user_roles
      WHERE role = 'admin'
      ORDER BY created_at NULLS LAST
      LIMIT 1;
  END IF;

  IF _recipient IS NULL THEN
    RAISE EXCEPTION 'No manager or admin found to receive this request.' USING ERRCODE = 'no_data_found';
  END IF;

  IF _project_id IS NOT NULL THEN
    SELECT name INTO _project_name FROM public.projects WHERE id = _project_id;
  END IF;

  _requester_name := COALESCE(_me.full_name, _me.email, 'A teammate');

  _body := _requester_name || ' needs a task: "' || trim(_title) || '"'
    || COALESCE(' — project: ' || _project_name, '')
    || COALESCE(E'\nNote: ' || NULLIF(trim(_note), ''), '');

  INSERT INTO public.notifications (user_id, kind, body)
  VALUES (_recipient, 'task_request', _body)
  RETURNING id INTO _notif_id;

  RETURN _notif_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_task_from_manager(text, uuid, text) TO authenticated;
