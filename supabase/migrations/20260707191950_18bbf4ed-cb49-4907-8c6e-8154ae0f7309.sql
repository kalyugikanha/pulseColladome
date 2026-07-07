
ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS logged_hours numeric,
  ADD COLUMN IF NOT EXISTS approved_hours numeric;

ALTER TABLE public.task_activity
  ADD COLUMN IF NOT EXISTS approved_hours numeric;

UPDATE public.attendance_logs
  SET logged_hours = COALESCE(logged_hours, total_hours)
  WHERE logged_hours IS NULL;

UPDATE public.attendance_logs
  SET approved_hours = COALESCE(approved_hours, total_hours)
  WHERE approved_at IS NOT NULL AND approved_hours IS NULL;

UPDATE public.task_activity
  SET approved_hours = hours
  WHERE approved_hours IS NULL
    AND hours IS NOT NULL
    AND approval_status IN ('approved','auto');
