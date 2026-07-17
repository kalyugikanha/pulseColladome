DROP TRIGGER IF EXISTS punch_sessions_close_stale_before_insert ON public.punch_sessions;
DROP FUNCTION IF EXISTS public.close_stale_open_punch_sessions();