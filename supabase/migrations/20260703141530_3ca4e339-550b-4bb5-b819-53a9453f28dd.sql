-- 1) Holidays table
CREATE TABLE IF NOT EXISTS public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO service_role;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "holidays: read" ON public.holidays;
CREATE POLICY "holidays: read" ON public.holidays FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "holidays: super manage" ON public.holidays;
CREATE POLICY "holidays: super manage" ON public.holidays FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

INSERT INTO public.holidays (holiday_date, name) VALUES
  ('2026-01-01','New Year'),
  ('2026-01-14','Makar Sankranti'),
  ('2026-01-26','Republic Day'),
  ('2026-03-04','Holi'),
  ('2026-03-21','Id-ul-Fitr (Ramzan Eid)'),
  ('2026-08-15','Independence Day'),
  ('2026-09-04','Janmashtami'),
  ('2026-10-02','Mahatma Gandhi Jayanti'),
  ('2026-10-20','Dussehra (Vijayadashami)'),
  ('2026-11-09','Diwali / Deepavali'),
  ('2026-12-25','Christmas Day')
ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name;

-- 2) Default monthly salary on role_grants (applied on signup)
ALTER TABLE public.role_grants ADD COLUMN IF NOT EXISTS default_monthly_salary numeric(12,2);

-- 3) Finance admin = shubham only
CREATE OR REPLACE FUNCTION public.is_finance_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND lower(email) = 'shubham@colladome.com'
  );
$function$;

-- 4) Reset admin/super_admin to only shubham
DELETE FROM public.super_admins
  WHERE user_id NOT IN (SELECT id FROM public.profiles WHERE lower(email) = 'shubham@colladome.com');
DELETE FROM public.user_roles
  WHERE role = 'admin'
    AND user_id NOT IN (SELECT id FROM public.profiles WHERE lower(email) = 'shubham@colladome.com');
-- ensure shubham is admin + super
INSERT INTO public.user_roles (user_id, role)
  SELECT id, 'admin'::public.app_role FROM public.profiles WHERE lower(email) = 'shubham@colladome.com'
  ON CONFLICT (user_id, role) DO NOTHING;
INSERT INTO public.super_admins (user_id)
  SELECT id FROM public.profiles WHERE lower(email) = 'shubham@colladome.com'
  ON CONFLICT DO NOTHING;

-- 5) Rebuild role_grants: only shubham is super_admin. Everyone else = employee.
DELETE FROM public.role_grants;
INSERT INTO public.role_grants (email, role, is_super_admin, default_monthly_salary) VALUES
  ('shubham@colladome.com','admin', true,  NULL),
  ('kanishka@colladome.in','employee', false, 35000),
  ('deepak@colladome.in','employee', false, 20000),
  ('sandeep@colladome.in','employee', false, 13000),
  ('shraddha.saxena@colladome.in','employee', false, 15000),
  ('arti@colladome.com','employee', false, 60000),
  ('akash@colladome.in','employee', false, 40000),
  ('sweksha@colladome.in','employee', false, 5000),
  ('jagjeet@colladome.in','employee', false, 28000),
  ('chirag@colladome.com','employee', false, 30000),
  ('juhi@colladome.com','employee', false, 20000),
  ('anjali@colladome.in','employee', false, 6000),
  ('neetu@colladome.in','employee', false, 2000),
  ('hemanth@colladome.in','employee', false, 10000),
  ('manvi@colladome.in','employee', false, 5000),
  ('trisha@colladome.in','employee', false, 5000),
  ('arpit@colladome.in','employee', false, 0),
  ('sarita@colladome.in','employee', false, 0),
  ('riyanshi@colladome.in','employee', false, 0);

-- 6) Upsert salaries for already-signed-up users (join by email)
INSERT INTO public.salaries (user_id, monthly_salary, effective_from, currency)
SELECT p.id, g.default_monthly_salary, CURRENT_DATE, 'INR'
FROM public.role_grants g
JOIN public.profiles p ON lower(p.email) = g.email
WHERE g.default_monthly_salary IS NOT NULL
ON CONFLICT (user_id, effective_from) DO UPDATE SET monthly_salary = EXCLUDED.monthly_salary;

-- 7) Update handle_new_user: new leave allowances (5 casual, 5 sick), apply salary from grant
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
    IF g.default_monthly_salary IS NOT NULL THEN
      INSERT INTO public.salaries (user_id, monthly_salary, effective_from, currency)
        VALUES (NEW.id, g.default_monthly_salary, CURRENT_DATE, 'INR')
        ON CONFLICT (user_id, effective_from) DO UPDATE SET monthly_salary = EXCLUDED.monthly_salary;
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

-- 8) Update existing leave_balances allocations to match new policy
UPDATE public.leave_balances SET allocated = 5 WHERE leave_type IN ('casual','sick');
UPDATE public.leave_balances SET allocated = 0 WHERE leave_type IN ('earned','unpaid');
