CREATE UNIQUE INDEX IF NOT EXISTS punch_sessions_one_open_per_user_idx
ON public.punch_sessions(user_id)
WHERE punch_out_time IS NULL;