
REVOKE ALL ON FUNCTION public.bd_list_visible_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bd_list_visible_users() FROM anon;
GRANT EXECUTE ON FUNCTION public.bd_list_visible_users() TO authenticated;
