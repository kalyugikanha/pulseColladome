REVOKE EXECUTE ON FUNCTION private.heads_department(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION private.is_department_head(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION private.is_head_of_user(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION private.is_reporting_manager_of(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION private.user_department(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_task(uuid) FROM anon;