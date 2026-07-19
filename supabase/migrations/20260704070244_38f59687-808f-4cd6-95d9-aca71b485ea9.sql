
-- 1) Remove overly broad approved-visibility policy
DROP POLICY IF EXISTS "leave: read approved minimal" ON public.leave_requests;

-- 2) Switch SECURITY DEFINER RPCs to SECURITY INVOKER; RLS on leave_requests enforces access
CREATE OR REPLACE FUNCTION public.get_my_leave_requests()
RETURNS SETOF public.leave_requests
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.leave_requests
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_leave_requests(_status leave_status DEFAULT NULL)
RETURNS SETOF public.leave_requests
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.leave_requests
  WHERE public.is_admin(auth.uid())
    AND (_status IS NULL OR status = _status)
  ORDER BY created_at DESC;
$$;
