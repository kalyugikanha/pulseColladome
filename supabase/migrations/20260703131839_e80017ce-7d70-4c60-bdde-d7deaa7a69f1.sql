-- 1. must_change_password on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Update handle_new_user: set must_change_password = true only for email/password signups
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

  INSERT INTO public.profiles (id, full_name, email, avatar_url, must_change_password)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    is_email_signup
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
  ELSE
    SELECT NOT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO is_first;
    INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'employee'::public.app_role END);
  END IF;

  INSERT INTO public.leave_balances (user_id, leave_type, allocated) VALUES
    (NEW.id, 'casual', 12),(NEW.id, 'sick', 8),(NEW.id, 'earned', 15),(NEW.id, 'unpaid', 0);
  RETURN NEW;
END;
$function$;

-- 2. salaries table
CREATE TABLE IF NOT EXISTS public.salaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_salary numeric(12,2) NOT NULL CHECK (monthly_salary >= 0),
  currency text NOT NULL DEFAULT 'INR',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, effective_from)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salaries TO authenticated;
GRANT ALL ON public.salaries TO service_role;

ALTER TABLE public.salaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salaries: super admin read"
  ON public.salaries FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "salaries: super admin insert"
  ON public.salaries FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "salaries: super admin update"
  ON public.salaries FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "salaries: super admin delete"
  ON public.salaries FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER salaries_set_updated_at BEFORE UPDATE ON public.salaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Also expose must_change_password to the owner (already covered by existing "read own or admin" policy)
