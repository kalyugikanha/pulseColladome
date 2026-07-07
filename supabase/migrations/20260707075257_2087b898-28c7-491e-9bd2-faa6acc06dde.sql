ALTER TABLE public.task_activity ADD COLUMN IF NOT EXISTS hours numeric(6,2);
ALTER TABLE public.task_stage_events ADD COLUMN IF NOT EXISTS hours numeric(6,2);