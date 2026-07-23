ALTER POLICY "tasks: reviewer update" ON public.tasks
  USING (reviewer_id = auth.uid())
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.cascade_reviewer_on_manager_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.reporting_manager_id IS DISTINCT FROM OLD.reporting_manager_id AND NEW.reporting_manager_id IS NOT NULL THEN
    UPDATE public.tasks
    SET reviewer_id = NEW.reporting_manager_id
    WHERE assignee_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cascade_reviewer_on_manager_change ON public.profiles;
CREATE TRIGGER trg_cascade_reviewer_on_manager_change
AFTER UPDATE OF reporting_manager_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.cascade_reviewer_on_manager_change();