ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS manual_rank double precision;
CREATE INDEX IF NOT EXISTS tasks_status_manual_rank_idx ON public.tasks(status, manual_rank);