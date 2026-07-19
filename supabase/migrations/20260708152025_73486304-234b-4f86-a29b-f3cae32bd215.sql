CREATE OR REPLACE FUNCTION public.seed_onboarding_sections()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _initial_status public.onboarding_section_status;
  _required boolean := false;  -- default: NOT required until HR turns it on
  _approved_at timestamptz;
BEGIN
  IF NEW.onboarding_completed = true THEN
    _initial_status := 'approved';
    _approved_at := COALESCE(NEW.onboarding_completed_at, now());
  ELSE
    _initial_status := 'draft';
    _approved_at := NULL;
  END IF;

  INSERT INTO public.onboarding_section_state (user_id, section, required, status, approved_at)
  SELECT NEW.id, s, _required, _initial_status, _approved_at
  FROM unnest(ARRAY['personal','work','bank','documents','follow','reviews','linkedin_employment']::public.onboarding_section[]) s
  ON CONFLICT (user_id, section) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Backfill: any existing row that hasn't been approved yet becomes not-required.
UPDATE public.onboarding_section_state
SET required = false
WHERE status <> 'approved';