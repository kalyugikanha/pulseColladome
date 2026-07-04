
CREATE OR REPLACE FUNCTION public.get_my_leave_requests()
RETURNS SETOF public.leave_requests
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT * FROM public.leave_requests
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_my_leave_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_leave_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_leave_requests(_status leave_status DEFAULT NULL)
RETURNS SETOF public.leave_requests
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT * FROM public.leave_requests
  WHERE public.is_admin(auth.uid())
    AND (_status IS NULL OR status = _status)
  ORDER BY created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.admin_get_leave_requests(leave_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_leave_requests(leave_status) TO authenticated;
