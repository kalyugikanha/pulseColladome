-- 1) Add 'trainee' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'trainee';

-- 2) Replace handle_new_user: no domain gate, admin-provisioned only
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  em text := lower(NEW.email);
  g record; ph record; is_first boolean; mgr_id uuid;
  any_admin_exists boolean;
BEGIN
  SELECT * INTO g FROM public.role_grants WHERE lower(email) = em LIMIT 1;
  SELECT * INTO ph FROM public.profiles WHERE lower(email) = em LIMIT 1;

  -- Bootstrap gate: first user ever becomes admin; otherwise require a grant or placeholder.
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO any_admin_exists;
  IF g.email IS NULL AND ph.id IS NULL AND any_admin_exists THEN
    RAISE EXCEPTION 'Your account hasn''t been set up yet. Please contact your administrator.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF g.reporting_manager_email IS NOT NULL THEN
    SELECT id INTO mgr_id FROM public.profiles WHERE lower(email) = lower(g.reporting_manager_email) LIMIT 1;
  END IF;

  IF ph.id IS NOT NULL AND ph.id <> NEW.id THEN
    UPDATE public.profiles SET email = NULL WHERE id = ph.id;
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
    UPDATE public.attendance_logs        SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.google_calendar_events SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.leave_requests         SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.salaries               SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.tasks                  SET assignee_id = NEW.id WHERE assignee_id = ph.id;
    UPDATE public.team_calendar_bookings SET created_by  = NEW.id WHERE created_by  = ph.id;
    UPDATE public.profiles               SET reporting_manager_id = NEW.id WHERE reporting_manager_id = ph.id;
    UPDATE public.leave_balances         SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.punch_sessions         SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.employee_bank_details  SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.employee_documents     SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.google_calendar_tokens SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.department_heads       SET user_id     = NEW.id WHERE user_id     = ph.id;
    DELETE FROM public.profiles WHERE id = ph.id;
  ELSIF ph.id IS NULL THEN
    INSERT INTO public.profiles (
      id, full_name, email, avatar_url, must_change_password,
      onboarding_completed, onboarding_required, department, reporting_manager_id
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
      NEW.email, NEW.raw_user_meta_data->>'avatar_url',
      false, false, true, g.department, mgr_id
    );
  END IF;

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
    is_first := NOT any_admin_exists;
    INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'employee'::public.app_role END)
      ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.leave_balances (user_id, leave_type, allocated) VALUES
    (NEW.id, 'casual', 5),(NEW.id, 'sick', 5),(NEW.id, 'earned', 0),(NEW.id, 'unpaid', 0)
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles p SET reporting_manager_id = NEW.id
  FROM public.role_grants rg
  WHERE lower(rg.email) = lower(p.email)
    AND lower(rg.reporting_manager_email) = em
    AND (p.reporting_manager_id IS NULL OR p.reporting_manager_id <> NEW.id);
  RETURN NEW;
END;
$function$;