
-- =====================================================================
-- Per-section onboarding: required flag + approval per section
-- =====================================================================

CREATE TYPE public.onboarding_section AS ENUM (
  'personal', 'work', 'bank', 'documents',
  'follow', 'reviews', 'linkedin_employment'
);

CREATE TYPE public.onboarding_section_status AS ENUM (
  'draft', 'submitted', 'approved', 'rejected'
);

CREATE TABLE public.onboarding_section_state (
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section            public.onboarding_section NOT NULL,
  required           boolean NOT NULL DEFAULT true,
  status             public.onboarding_section_status NOT NULL DEFAULT 'draft',
  submitted_at       timestamptz,
  approved_at        timestamptz,
  approved_by        uuid REFERENCES auth.users(id),
  rejected_at        timestamptz,
  rejection_reason   text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, section)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_section_state TO authenticated;
GRANT ALL ON public.onboarding_section_state TO service_role;

ALTER TABLE public.onboarding_section_state ENABLE ROW LEVEL SECURITY;

-- User can read own rows
CREATE POLICY "user reads own onboarding sections"
  ON public.onboarding_section_state FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- User can update own rows (server fn validates transitions)
CREATE POLICY "user updates own onboarding sections"
  ON public.onboarding_section_state FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- HR admin / super admin read + update all
CREATE POLICY "hr/super read all onboarding sections"
  ON public.onboarding_section_state FOR SELECT TO authenticated
  USING (private.is_hr_admin(auth.uid()) OR private.is_super_admin(auth.uid()));

CREATE POLICY "hr/super update all onboarding sections"
  ON public.onboarding_section_state FOR UPDATE TO authenticated
  USING (private.is_hr_admin(auth.uid()) OR private.is_super_admin(auth.uid()))
  WITH CHECK (private.is_hr_admin(auth.uid()) OR private.is_super_admin(auth.uid()));

CREATE POLICY "hr/super insert onboarding sections"
  ON public.onboarding_section_state FOR INSERT TO authenticated
  WITH CHECK (private.is_hr_admin(auth.uid()) OR private.is_super_admin(auth.uid()));

-- updated_at trigger
CREATE TRIGGER onboarding_section_state_set_updated_at
  BEFORE UPDATE ON public.onboarding_section_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed 7 rows on new profile insert
CREATE OR REPLACE FUNCTION public.seed_onboarding_sections()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _initial_status public.onboarding_section_status;
  _required boolean := COALESCE(NEW.onboarding_required, true);
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
$$;

CREATE TRIGGER profiles_seed_onboarding_sections
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.seed_onboarding_sections();

-- Backfill existing profiles
INSERT INTO public.onboarding_section_state (user_id, section, required, status, approved_at)
SELECT
  p.id,
  s,
  COALESCE(p.onboarding_required, true),
  CASE WHEN p.onboarding_completed = true THEN 'approved'::public.onboarding_section_status
       ELSE 'draft'::public.onboarding_section_status END,
  CASE WHEN p.onboarding_completed = true THEN COALESCE(p.onboarding_completed_at, now()) ELSE NULL END
FROM public.profiles p
CROSS JOIN unnest(ARRAY['personal','work','bank','documents','follow','reviews','linkedin_employment']::public.onboarding_section[]) s
ON CONFLICT (user_id, section) DO NOTHING;

-- Gate helper: returns TRUE when the user is blocked from the portal
-- (any required section is not approved).
CREATE OR REPLACE FUNCTION public.user_onboarding_gate(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.onboarding_section_state
    WHERE user_id = _uid
      AND required = true
      AND status <> 'approved'
  );
$$;
