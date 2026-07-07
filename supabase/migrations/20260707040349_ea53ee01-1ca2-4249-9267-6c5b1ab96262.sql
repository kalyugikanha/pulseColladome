
REVOKE ALL ON FUNCTION private.bd_report_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_manage_bd_user(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.bd_visible_user_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.bd_report_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_bd_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.bd_visible_user_ids(uuid) TO authenticated;
