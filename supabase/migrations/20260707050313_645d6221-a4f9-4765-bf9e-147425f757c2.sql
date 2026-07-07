REVOKE ALL ON FUNCTION public.advance_task_stage(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_task_stage(uuid, text, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_task_stages(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_task_stages(uuid, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.find_auth_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_auth_user_id_by_email(text) TO service_role;