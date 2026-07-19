CREATE OR REPLACE FUNCTION public.sync_attendance_from_punch_sessions(_user_id uuid, _session_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _first_in timestamptz;
  _last_out timestamptz;
  _has_open boolean;
  _total numeric;
  _tasks jsonb;
BEGIN
  SELECT
    min(ps.punch_in_time),
    max(ps.punch_out_time) FILTER (WHERE ps.punch_out_time IS NOT NULL),
    bool_or(ps.punch_out_time IS NULL),
    COALESCE(sum(COALESCE(ps.hours, 0)) FILTER (WHERE ps.punch_out_time IS NOT NULL), 0),
    COALESCE(
      jsonb_agg(task_item ORDER BY ps.punch_in_time) FILTER (WHERE task_item IS NOT NULL),
      '[]'::jsonb
    )
  INTO _first_in, _last_out, _has_open, _total, _tasks
  FROM public.punch_sessions ps
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(ps.allocations, '[]'::jsonb)) AS task_item ON true
  WHERE ps.user_id = _user_id
    AND ps.session_date = _session_date;

  IF _first_in IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.attendance_logs (
    user_id,
    date,
    punch_in_time,
    punch_out_time,
    total_hours,
    tasks
  ) VALUES (
    _user_id,
    _session_date,
    _first_in,
    CASE WHEN COALESCE(_has_open, false) THEN NULL ELSE _last_out END,
    COALESCE(_total, 0),
    COALESCE(_tasks, '[]'::jsonb)
  )
  ON CONFLICT (user_id, date) DO UPDATE SET
    punch_in_time = LEAST(
      COALESCE(public.attendance_logs.punch_in_time, EXCLUDED.punch_in_time),
      EXCLUDED.punch_in_time
    ),
    punch_out_time = EXCLUDED.punch_out_time,
    total_hours = EXCLUDED.total_hours,
    tasks = EXCLUDED.tasks,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_punch_session_attendance_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_attendance_from_punch_sessions(OLD.user_id, OLD.session_date);
    RETURN OLD;
  END IF;

  PERFORM public.sync_attendance_from_punch_sessions(NEW.user_id, NEW.session_date);

  IF TG_OP = 'UPDATE' AND (OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.session_date IS DISTINCT FROM NEW.session_date) THEN
    PERFORM public.sync_attendance_from_punch_sessions(OLD.user_id, OLD.session_date);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS punch_sessions_attendance_sync ON public.punch_sessions;
CREATE TRIGGER punch_sessions_attendance_sync
AFTER INSERT OR UPDATE OR DELETE ON public.punch_sessions
FOR EACH ROW EXECUTE FUNCTION public.handle_punch_session_attendance_sync();

-- Repair current production mismatch without changing original punch-in times.
WITH active_dates AS (
  SELECT DISTINCT user_id, session_date
  FROM public.punch_sessions
  WHERE session_date >= current_date - interval '1 day'
)
SELECT public.sync_attendance_from_punch_sessions(user_id, session_date)
FROM active_dates;