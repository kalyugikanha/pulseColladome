
REVOKE EXECUTE ON FUNCTION private.reports_tree_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.is_in_reports_tree(uuid, uuid) FROM PUBLIC, anon, authenticated;
