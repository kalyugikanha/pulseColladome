
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_required boolean NOT NULL DEFAULT true;
UPDATE public.profiles SET onboarding_required = false WHERE created_at < now();

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  em text := lower(NEW.email);
  g record;
  is_first boolean;
  is_email_signup boolean;
BEGIN
  is_email_signup := COALESCE(NEW.raw_app_meta_data->>'provider', 'email') = 'email';

  INSERT INTO public.profiles (id, full_name, email, avatar_url, must_change_password, onboarding_completed, onboarding_required)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    is_email_signup,
    false,
    true
  );

  SELECT * INTO g FROM public.role_grants WHERE email = em;
  IF g.email IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, g.role)
      ON CONFLICT (user_id, role) DO NOTHING;
    IF g.is_super_admin THEN
      INSERT INTO public.super_admins (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
    IF g.default_monthly_salary IS NOT NULL THEN
      INSERT INTO public.salaries (user_id, monthly_salary, effective_from, currency)
        VALUES (NEW.id, g.default_monthly_salary, CURRENT_DATE, 'INR')
        ON CONFLICT (user_id, effective_from) DO UPDATE SET monthly_salary = EXCLUDED.monthly_salary;
    END IF;
    IF g.department IS NOT NULL AND length(trim(g.department)) > 0 THEN
      UPDATE public.profiles SET department = g.department WHERE id = NEW.id;
    END IF;
  ELSE
    SELECT NOT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO is_first;
    INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'employee'::public.app_role END);
  END IF;

  INSERT INTO public.leave_balances (user_id, leave_type, allocated) VALUES
    (NEW.id, 'casual', 5),(NEW.id, 'sick', 5),(NEW.id, 'earned', 0),(NEW.id, 'unpaid', 0)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;
