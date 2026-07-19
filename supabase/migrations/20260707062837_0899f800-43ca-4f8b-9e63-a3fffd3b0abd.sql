GRANT EXECUTE ON FUNCTION private.is_in_reports_tree(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_reporting_manager_of(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_hr_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_projects(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_head_of_user(uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION private.is_in_reports_tree(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.is_reporting_manager_of(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.is_hr_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.is_super_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_projects(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.is_head_of_user(uuid, uuid) TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.punch_sessions TO authenticated;
GRANT ALL ON public.punch_sessions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_logs TO authenticated;
GRANT ALL ON public.attendance_logs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;