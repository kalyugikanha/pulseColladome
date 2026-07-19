
-- Recreate view as SECURITY INVOKER
DROP VIEW IF EXISTS public.team_leave_calendar;
CREATE VIEW public.team_leave_calendar
WITH (security_invoker = true) AS
SELECT lr.id, lr.user_id, lr.leave_type, lr.start_date, lr.end_date, lr.status,
       p.full_name
FROM public.leave_requests lr
LEFT JOIN public.profiles p ON p.id = lr.user_id
WHERE lr.status = 'approved';

REVOKE ALL ON public.team_leave_calendar FROM PUBLIC, anon;
GRANT SELECT ON public.team_leave_calendar TO authenticated;

-- Policy so authenticated users can read approved rows (used by the view)
DROP POLICY IF EXISTS "leave: read approved minimal" ON public.leave_requests;
CREATE POLICY "leave: read approved minimal"
  ON public.leave_requests
  FOR SELECT
  TO authenticated
  USING (status = 'approved'::leave_status);

-- Column-level restriction: authenticated cannot select 'reason' broadly.
REVOKE SELECT ON public.leave_requests FROM authenticated;
GRANT SELECT (id, user_id, leave_type, start_date, end_date, days, status,
              admin_comment, decided_by, decided_at, created_at, updated_at)
  ON public.leave_requests TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
