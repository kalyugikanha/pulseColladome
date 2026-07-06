
CREATE OR REPLACE FUNCTION public.handle_leave_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' THEN
      UPDATE public.leave_balances
        SET used = used + NEW.days
        WHERE user_id = NEW.user_id AND leave_type = NEW.leave_type;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE public.leave_balances
      SET used = used + NEW.days
      WHERE user_id = NEW.user_id AND leave_type = NEW.leave_type;
  ELSIF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    UPDATE public.leave_balances
      SET used = GREATEST(0, used - OLD.days)
      WHERE user_id = OLD.user_id AND leave_type = OLD.leave_type;
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_leave_status_change ON public.leave_requests;
CREATE TRIGGER trg_leave_status_change
AFTER INSERT OR UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.handle_leave_status_change();

-- Backfill used counts from approved leave_requests
UPDATE public.leave_balances lb
SET used = COALESCE(sub.total, 0)
FROM (
  SELECT user_id, leave_type, SUM(days)::numeric AS total
  FROM public.leave_requests
  WHERE status = 'approved'
  GROUP BY user_id, leave_type
) sub
WHERE lb.user_id = sub.user_id AND lb.leave_type = sub.leave_type;
