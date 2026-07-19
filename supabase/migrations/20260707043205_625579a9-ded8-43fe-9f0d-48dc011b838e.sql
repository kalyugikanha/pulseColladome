GRANT SELECT, INSERT, UPDATE, DELETE ON public.punch_sessions TO authenticated;
GRANT ALL ON public.punch_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_logs TO authenticated;
GRANT ALL ON public.attendance_logs TO service_role;