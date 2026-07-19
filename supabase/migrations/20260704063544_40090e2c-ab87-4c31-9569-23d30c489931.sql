
-- Restore full column select for owners/admins via RLS (drop column-level restriction)
GRANT SELECT ON public.leave_requests TO authenticated;

-- Drop the broad-approved policy; only owner + admin see the raw table now.
DROP POLICY IF EXISTS "leave: read approved minimal" ON public.leave_requests;

-- Recreate the team calendar view as SECURITY DEFINER (default) so it bypasses RLS
-- and exposes only safe columns to authenticated users.
DROP VIEW IF EXISTS public.team_leave_calendar;
CREATE VIEW public.team_leave_calendar AS
SELECT lr.id, lr.user_id, lr.leave_type, lr.start_date, lr.end_date, lr.status,
       p.full_name
FROM public.leave_requests lr
LEFT JOIN public.profiles p ON p.id = lr.user_id
WHERE lr.status = 'approved';

REVOKE ALL ON public.team_leave_calendar FROM PUBLIC, anon;
GRANT SELECT ON public.team_leave_calendar TO authenticated;

-- Drop the reason helper (not needed; owners/admins now read reason via RLS directly)
DROP FUNCTION IF EXISTS public.get_leave_reason(uuid);
