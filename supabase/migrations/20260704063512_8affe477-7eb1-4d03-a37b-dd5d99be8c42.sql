
-- 1) Restrict approved leave visibility: drop broad policy, expose safe columns via view
DROP POLICY IF EXISTS "leave: read approved by all" ON public.leave_requests;

CREATE OR REPLACE VIEW public.team_leave_calendar
WITH (security_invoker = true) AS
SELECT id, user_id, leave_type, start_date, end_date, status
FROM public.leave_requests
WHERE status = 'approved';

REVOKE ALL ON public.team_leave_calendar FROM PUBLIC, anon;
GRANT SELECT ON public.team_leave_calendar TO authenticated;

-- Re-add a narrow policy so the view (running as invoker) can read approved rows
CREATE POLICY "leave: read approved minimal"
  ON public.leave_requests
  FOR SELECT
  TO authenticated
  USING (status = 'approved'::leave_status);

-- Column-level: prevent non-owners/non-admins from selecting the sensitive columns.
-- Revoke wide column select then grant only safe columns to authenticated.
REVOKE SELECT ON public.leave_requests FROM authenticated;
GRANT SELECT (id, user_id, leave_type, start_date, end_date, days, status, admin_comment, decided_by, decided_at, created_at, updated_at)
  ON public.leave_requests TO authenticated;
-- 'reason' column intentionally NOT granted to authenticated broadly.
-- Owners and admins access 'reason' via SECURITY DEFINER helper below.

-- Helper function for owner/admin to read reason
CREATE OR REPLACE FUNCTION public.get_leave_reason(_leave_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT reason FROM public.leave_requests
  WHERE id = _leave_id
    AND (user_id = auth.uid() OR public.is_admin(auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.get_leave_reason(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leave_reason(uuid) TO authenticated;

-- 2) Lock down SECURITY DEFINER function execution
-- Trigger-only functions: revoke from everyone (triggers run as table owner)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_leave_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Role helpers: revoke from anon; keep authenticated (RLS needs it)
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_finance_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_finance_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_manage_projects(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_projects(uuid) TO authenticated;
