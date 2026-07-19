REVOKE ALL ON FUNCTION public.create_task_full(uuid, text, text, date, public.task_priority, uuid, jsonb, uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_task_full(uuid, text, text, date, public.task_priority, uuid, jsonb, uuid, uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_task_full(uuid, text, text, date, public.task_priority, uuid, jsonb, uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_task_full(uuid, text, text, date, public.task_priority, uuid, jsonb, uuid, uuid, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.can_view_task(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_task(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_view_task(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.can_view_task(uuid) FROM service_role;