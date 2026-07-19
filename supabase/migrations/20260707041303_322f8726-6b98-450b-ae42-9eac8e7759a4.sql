
-- Recursive reports tree helper (excludes the manager themselves)
CREATE OR REPLACE FUNCTION private.reports_tree_ids(_manager uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH RECURSIVE tree AS (
    SELECT p.id FROM public.profiles p WHERE p.reporting_manager_id = _manager
    UNION
    SELECT p.id FROM public.profiles p
    JOIN tree t ON p.reporting_manager_id = t.id
  )
  SELECT id FROM tree;
$$;

CREATE OR REPLACE FUNCTION private.is_in_reports_tree(_manager uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _manager IS NOT NULL AND _user IS NOT NULL
    AND EXISTS(SELECT 1 FROM private.reports_tree_ids(_manager) t WHERE t.user_id = _user);
$$;

-- ATTENDANCE: drop dept-head paths, widen reporting-manager to full tree
DROP POLICY IF EXISTS "attendance: dept head read"   ON public.attendance_logs;
DROP POLICY IF EXISTS "attendance: dept head update" ON public.attendance_logs;
DROP POLICY IF EXISTS "attendance: reporting manager read"   ON public.attendance_logs;
DROP POLICY IF EXISTS "attendance: reporting manager update" ON public.attendance_logs;

CREATE POLICY "attendance: manager tree read"
  ON public.attendance_logs FOR SELECT
  USING (private.is_in_reports_tree(auth.uid(), user_id));

CREATE POLICY "attendance: manager tree update"
  ON public.attendance_logs FOR UPDATE
  USING (private.is_in_reports_tree(auth.uid(), user_id));

-- LEAVE REQUESTS: same
DROP POLICY IF EXISTS "leave: dept head read"   ON public.leave_requests;
DROP POLICY IF EXISTS "leave: dept head decide" ON public.leave_requests;
DROP POLICY IF EXISTS "leave: reporting manager read"   ON public.leave_requests;
DROP POLICY IF EXISTS "leave: reporting manager decide" ON public.leave_requests;

CREATE POLICY "leave: manager tree read"
  ON public.leave_requests FOR SELECT
  USING (private.is_in_reports_tree(auth.uid(), user_id));

CREATE POLICY "leave: manager tree decide"
  ON public.leave_requests FOR UPDATE
  USING (private.is_in_reports_tree(auth.uid(), user_id));

-- PUNCH SESSIONS: same
DROP POLICY IF EXISTS "punch_sessions: dept head read"   ON public.punch_sessions;
DROP POLICY IF EXISTS "punch_sessions: dept head update" ON public.punch_sessions;
DROP POLICY IF EXISTS "punch_sessions: dept head delete" ON public.punch_sessions;
DROP POLICY IF EXISTS "punch_sessions: reporting manager read"   ON public.punch_sessions;
DROP POLICY IF EXISTS "punch_sessions: reporting manager update" ON public.punch_sessions;
DROP POLICY IF EXISTS "punch_sessions: reporting manager delete" ON public.punch_sessions;

CREATE POLICY "punch_sessions: manager tree read"
  ON public.punch_sessions FOR SELECT
  USING (private.is_in_reports_tree(auth.uid(), user_id));

CREATE POLICY "punch_sessions: manager tree update"
  ON public.punch_sessions FOR UPDATE
  USING (private.is_in_reports_tree(auth.uid(), user_id));

CREATE POLICY "punch_sessions: manager tree delete"
  ON public.punch_sessions FOR DELETE
  USING (private.is_in_reports_tree(auth.uid(), user_id));
