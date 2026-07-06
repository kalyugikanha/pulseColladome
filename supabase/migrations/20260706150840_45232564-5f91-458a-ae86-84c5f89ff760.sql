CREATE OR REPLACE FUNCTION public.find_auth_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_auth_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_auth_user_id_by_email(text) TO authenticated, service_role;