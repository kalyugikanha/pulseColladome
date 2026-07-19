CREATE OR REPLACE FUNCTION public.close_stale_open_punch_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.punch_sessions
  SET punch_out_time = punch_in_time,
      hours = COALESCE(hours, 0),
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND punch_out_time IS NULL
    AND session_date < NEW.session_date;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.close_stale_open_punch_sessions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS punch_sessions_close_stale_before_insert ON public.punch_sessions;
CREATE TRIGGER punch_sessions_close_stale_before_insert
BEFORE INSERT ON public.punch_sessions
FOR EACH ROW EXECUTE FUNCTION public.close_stale_open_punch_sessions();

-- For users whose current attendance row was open today but only had a stale previous-day punch row,
-- move that stale row to today's actual punch-in so the timer and HR status are durable again.
WITH today_open_attendance AS (
  SELECT al.user_id, al.date, al.punch_in_time
  FROM public.attendance_logs al
  WHERE al.date = current_date
    AND al.punch_in_time IS NOT NULL
    AND al.punch_out_time IS NULL
), stale_open AS (
  SELECT ps.id, toa.date, toa.punch_in_time
  FROM public.punch_sessions ps
  JOIN today_open_attendance toa ON toa.user_id = ps.user_id
  WHERE ps.punch_out_time IS NULL
    AND ps.session_date < toa.date
    AND NOT EXISTS (
      SELECT 1
      FROM public.punch_sessions current_ps
      WHERE current_ps.user_id = ps.user_id
        AND current_ps.session_date = toa.date
        AND current_ps.punch_out_time IS NULL
    )
)
UPDATE public.punch_sessions ps
SET session_date = stale_open.date,
    punch_in_time = stale_open.punch_in_time,
    updated_at = now()
FROM stale_open
WHERE ps.id = stale_open.id;

-- Close any remaining previous-day open sessions that do not represent today's active attendance.
UPDATE public.punch_sessions ps
SET punch_out_time = ps.punch_in_time,
    hours = COALESCE(ps.hours, 0),
    updated_at = now()
WHERE ps.punch_out_time IS NULL
  AND ps.session_date < current_date;