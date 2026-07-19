CREATE POLICY "attendance: hr admin read all" ON public.attendance_logs FOR SELECT USING (private.is_hr_admin(auth.uid()));
CREATE POLICY "attendance: hr admin update all" ON public.attendance_logs FOR UPDATE USING (private.is_hr_admin(auth.uid()));
CREATE POLICY "punch_sessions: hr admin read all" ON public.punch_sessions FOR SELECT USING (private.is_hr_admin(auth.uid()));