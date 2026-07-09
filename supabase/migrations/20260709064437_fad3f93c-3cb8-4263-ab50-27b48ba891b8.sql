CREATE OR REPLACE FUNCTION public.list_assignable_users()
RETURNS TABLE(id uuid, full_name text, email text, department text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.department
    FROM public.profiles p
    WHERE COALESCE(p.is_active, true) = true
      AND COALESCE(p.is_placeholder, false) = false
    ORDER BY p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_assignable_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_assignable_users() TO authenticated;