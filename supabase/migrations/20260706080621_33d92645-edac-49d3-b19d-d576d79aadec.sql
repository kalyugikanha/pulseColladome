
-- 1) Add reporting_manager_email to role_grants + case-insensitive index
ALTER TABLE public.role_grants ADD COLUMN IF NOT EXISTS reporting_manager_email text;
CREATE UNIQUE INDEX IF NOT EXISTS role_grants_email_lower_idx ON public.role_grants ((lower(email)));
CREATE INDEX IF NOT EXISTS profiles_email_lower_idx ON public.profiles ((lower(email)));

-- 2) Seed reporting manager mappings
UPDATE public.role_grants SET reporting_manager_email = 'shubham@colladome.com' WHERE email = 'kanishka@colladome.in';

-- 3) Domain-restrict + merge-by-email trigger for auth.users inserts
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  em text := lower(NEW.email);
  domain text := lower(split_part(NEW.email, '@', 2));
  g record;
  ph record;
  is_first boolean;
  mgr_id uuid;
BEGIN
  -- Enforce Colladome domain (Google SSO only in UI, DB is the real gate)
  IF domain NOT IN ('colladome.com', 'colladome.in') THEN
    RAISE EXCEPTION 'Only @colladome.com or @colladome.in Google accounts are allowed. Please contact HR.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO g FROM public.role_grants WHERE lower(email) = em LIMIT 1;

  IF g.reporting_manager_email IS NOT NULL THEN
    SELECT id INTO mgr_id FROM public.profiles WHERE lower(email) = lower(g.reporting_manager_email) LIMIT 1;
  END IF;

  -- Find any existing profile (typically placeholder) with same email
  SELECT * INTO ph FROM public.profiles WHERE lower(email) = em LIMIT 1;

  IF ph.id IS NOT NULL AND ph.id <> NEW.id THEN
    -- Re-point FKs from placeholder id to NEW.id
    UPDATE public.attendance_logs        SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.google_calendar_events SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.leave_requests         SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.salaries               SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.tasks                  SET assignee_id = NEW.id WHERE assignee_id = ph.id;
    UPDATE public.team_calendar_bookings SET created_by  = NEW.id WHERE created_by  = ph.id;
    UPDATE public.profiles               SET reporting_manager_id = NEW.id WHERE reporting_manager_id = ph.id;

    DELETE FROM public.profiles WHERE id = ph.id;

    INSERT INTO public.profiles (
      id, full_name, email, avatar_url, must_change_password,
      onboarding_completed, onboarding_required,
      department, date_of_birth, joined_on, phone, employment_type, notes,
      personal_email, permanent_address, marriage_anniversary,
      linkedin_url, github_url, profile_picture_url, day_start_time, standup_time,
      facebook_url, instagram_url, twitter_url, youtube_url, pinterest_url,
      reporting_manager_id, is_active, is_placeholder
    ) VALUES (
      NEW.id,
      COALESCE(ph.full_name, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'avatar_url', ph.avatar_url),
      false, ph.onboarding_completed, COALESCE(ph.onboarding_required, true),
      COALESCE(g.department, ph.department),
      ph.date_of_birth, ph.joined_on, ph.phone, ph.employment_type, ph.notes,
      ph.personal_email, ph.permanent_address, ph.marriage_anniversary,
      ph.linkedin_url, ph.github_url, ph.profile_picture_url, ph.day_start_time, ph.standup_time,
      ph.facebook_url, ph.instagram_url, ph.twitter_url, ph.youtube_url, ph.pinterest_url,
      COALESCE(mgr_id, ph.reporting_manager_id), COALESCE(ph.is_active, true), false
    );
  ELSIF ph.id IS NULL THEN
    INSERT INTO public.profiles (
      id, full_name, email, avatar_url, must_change_password,
      onboarding_completed, onboarding_required, department, reporting_manager_id
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
      NEW.email,
      NEW.raw_user_meta_data->>'avatar_url',
      false, false, true, g.department, mgr_id
    );
  END IF;

  -- Roles
  IF g.email IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, g.role) ON CONFLICT DO NOTHING;
    IF g.is_super_admin THEN
      INSERT INTO public.super_admins (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    END IF;
    IF g.default_monthly_salary IS NOT NULL THEN
      INSERT INTO public.salaries (user_id, monthly_salary, effective_from, currency)
        VALUES (NEW.id, g.default_monthly_salary, CURRENT_DATE, 'INR')
        ON CONFLICT (user_id, effective_from) DO UPDATE SET monthly_salary = EXCLUDED.monthly_salary;
    END IF;
  ELSE
    SELECT NOT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO is_first;
    INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'employee'::public.app_role END)
      ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.leave_balances (user_id, leave_type, allocated) VALUES
    (NEW.id, 'casual', 5),(NEW.id, 'sick', 5),(NEW.id, 'earned', 0),(NEW.id, 'unpaid', 0)
  ON CONFLICT DO NOTHING;

  -- Back-link: any profile whose role_grants points at this user becomes their report
  UPDATE public.profiles p
    SET reporting_manager_id = NEW.id
  FROM public.role_grants rg
  WHERE lower(rg.email) = lower(p.email)
    AND lower(rg.reporting_manager_email) = em
    AND (p.reporting_manager_id IS NULL OR p.reporting_manager_id <> NEW.id);

  RETURN NEW;
END;
$$;

-- 4) Block domain changes on auth.users
CREATE OR REPLACE FUNCTION public.enforce_colladome_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  domain text := lower(split_part(NEW.email, '@', 2));
BEGIN
  IF domain NOT IN ('colladome.com', 'colladome.in') THEN
    RAISE EXCEPTION 'Only @colladome.com or @colladome.in emails are allowed.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_colladome_email_on_update ON auth.users;
CREATE TRIGGER enforce_colladome_email_on_update
  BEFORE UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_colladome_email();

-- 5) Purge any existing non-Colladome auth users (cascades to profiles/roles)
DELETE FROM auth.users
  WHERE lower(split_part(email, '@', 2)) NOT IN ('colladome.com', 'colladome.in');
