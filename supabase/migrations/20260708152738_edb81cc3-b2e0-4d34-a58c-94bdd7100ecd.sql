-- 1. Add hours_worked column to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS hours_worked numeric;

-- 2. Auto-set reviewer to assignee's reporting manager on insert/update
CREATE OR REPLACE FUNCTION public.tasks_auto_reviewer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mgr_id uuid;
BEGIN
  IF NEW.assignee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT reporting_manager_id INTO mgr_id
  FROM public.profiles WHERE id = NEW.assignee_id;

  IF mgr_id IS NOT NULL AND mgr_id <> NEW.assignee_id THEN
    NEW.reviewer_id := mgr_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_auto_reviewer ON public.tasks;
CREATE TRIGGER trg_tasks_auto_reviewer
BEFORE INSERT OR UPDATE OF assignee_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_auto_reviewer();

-- 3. Backfill: overwrite reviewer on all non-done tasks whose assignee has a reporting manager
UPDATE public.tasks t
SET reviewer_id = p.reporting_manager_id
FROM public.profiles p
WHERE t.assignee_id = p.id
  AND p.reporting_manager_id IS NOT NULL
  AND p.reporting_manager_id <> t.assignee_id
  AND t.status <> 'done';