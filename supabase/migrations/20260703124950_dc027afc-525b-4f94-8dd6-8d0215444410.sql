
-- 1. Projects: add unique code
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS code text;
UPDATE public.projects SET code = 'CLDM-' || substr(id::text, 1, 8) WHERE code IS NULL;
ALTER TABLE public.projects ALTER COLUMN code SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_code_key') THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_code_key UNIQUE (code);
  END IF;
END $$;

-- 2. super_admins table
CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.super_admins TO authenticated;
GRANT ALL ON public.super_admins TO service_role;
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- 3. is_super_admin function (create before policies that reference it)
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.super_admins WHERE user_id = _user_id)
$$;

-- 4. Policies on super_admins
DROP POLICY IF EXISTS "super_admins: self read" ON public.super_admins;
CREATE POLICY "super_admins: self read" ON public.super_admins
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "super_admins: super manage" ON public.super_admins;
CREATE POLICY "super_admins: super manage" ON public.super_admins
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 5. Expand is_admin to include super admins
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
    OR EXISTS(SELECT 1 FROM public.super_admins WHERE user_id = _user_id)
$$;

-- 6. role_grants table (email -> auto role on signup)
CREATE TABLE IF NOT EXISTS public.role_grants (
  email text PRIMARY KEY,
  role public.app_role NOT NULL DEFAULT 'employee',
  is_super_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.role_grants TO authenticated;
GRANT ALL ON public.role_grants TO service_role;
ALTER TABLE public.role_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "role_grants: super manage" ON public.role_grants;
CREATE POLICY "role_grants: super manage" ON public.role_grants
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 7. Seed role grants
INSERT INTO public.role_grants (email, role, is_super_admin) VALUES
  ('shubham@colladome.com', 'admin',   true),
  ('project@colladome.com', 'admin',   true),
  ('arti@colladome.com',    'admin',   true),
  ('marketing@colladome.in','admin',   false),
  ('deepak@colladome.in',   'employee',false)
ON CONFLICT (email) DO UPDATE
  SET role = EXCLUDED.role, is_super_admin = EXCLUDED.is_super_admin;

-- 8. Rewrite handle_new_user to apply grants; keep first-user fallback for bootstrap
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  em text := lower(NEW.email);
  g record;
  is_first boolean;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
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
$$;

-- 9. Retro-apply grants for any users that already signed up with a listed email
INSERT INTO public.super_admins (user_id)
SELECT p.id FROM public.profiles p
JOIN public.role_grants g ON g.email = lower(p.email)
WHERE g.is_super_admin = true
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, g.role FROM public.profiles p
JOIN public.role_grants g ON g.email = lower(p.email)
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::public.app_role FROM public.profiles p
JOIN public.role_grants g ON g.email = lower(p.email)
WHERE g.is_super_admin = true
ON CONFLICT (user_id, role) DO NOTHING;

-- 10. Seed projects
INSERT INTO public.projects (code, name, status) VALUES
  ('CLDM00000','Colladome Social Media','active'),
  ('CLDM00101','Colladome Internal Coordination & Management','active'),
  ('CLDM00102','Colladome Website','active'),
  ('CLDM00103','Outfitq','active'),
  ('CLDM00104','Colladome RA','active'),
  ('CLDM00392','Drone Karaan','active'),
  ('CLDM00414','Pawgin','active'),
  ('CLDM00418','Bus Arabia','active'),
  ('CLDM00481','Briskon Technologies','active'),
  ('CLDM00503','Nikunj','active'),
  ('CLDM00504','Freegi','active'),
  ('CLDM00512','RR Pay','active'),
  ('CLDM00514','Stay Master','active'),
  ('CLDM00521','Growinsight','active'),
  ('CLDM00522','Oswal','active'),
  ('CLDM00523','Idhyam','active'),
  ('CLDM00524','Selfup','active'),
  ('CLDM00527','Growinsight (Phase 2)','active'),
  ('CLDM00529','Brikson','active'),
  ('CLDM00547','Softlogic','active'),
  ('CLDM00563','Outfitq (Phase 2)','active'),
  ('CLDM00564','Eartheon','active'),
  ('CLDM00565','Colladome Documentation','active'),
  ('CLDM00566','Colladome Finance','active'),
  ('CLDM00567','Colladome Business Development','active'),
  ('CLDM00568','Colladome Hiring','active')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;
