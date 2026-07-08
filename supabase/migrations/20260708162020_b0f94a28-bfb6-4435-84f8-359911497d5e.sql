CREATE OR REPLACE FUNCTION public.tasks_auto_reviewer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mgr_id uuid;
  fallback_id uuid;
BEGIN
  IF NEW.assignee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT reporting_manager_id INTO mgr_id
  FROM public.profiles WHERE id = NEW.assignee_id;

  IF mgr_id IS NOT NULL AND mgr_id <> NEW.assignee_id THEN
    NEW.reviewer_id := mgr_id;
    RETURN NEW;
  END IF;

  -- Fallback: no reporting manager → first super admin (deterministic).
  SELECT user_id INTO fallback_id
  FROM public.super_admins
  WHERE user_id <> NEW.assignee_id
  ORDER BY user_id
  LIMIT 1;

  IF fallback_id IS NOT NULL THEN
    NEW.reviewer_id := fallback_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix the currently-stuck-in-review tasks whose assignee has no manager.
UPDATE public.tasks t
SET reviewer_id = (
  SELECT sa.user_id FROM public.super_admins sa
  WHERE sa.user_id <> t.assignee_id
  ORDER BY sa.user_id LIMIT 1
)
FROM public.profiles p
WHERE t.assignee_id = p.id
  AND p.reporting_manager_id IS NULL
  AND t.status = 'review'
  AND (t.reviewer_id IS NULL OR t.reviewer_id = t.assignee_id);