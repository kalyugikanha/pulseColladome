
-- 1) Extend app_role enum with 'hr_admin' (must be its own statement)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr_admin';

-- 2) New profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS employment_type text,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_employment_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_employment_type_check
  CHECK (employment_type IS NULL OR employment_type IN ('full_time','intern','contract','consultant'));

-- 3) is_hr_admin helper (text comparison avoids referencing the just-added enum value)
CREATE OR REPLACE FUNCTION private.is_hr_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'hr_admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION private.is_hr_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_hr_admin(uuid) TO authenticated, service_role;

-- 4) Extend RLS: HR admin can read/update all profiles
DROP POLICY IF EXISTS "profiles: hr read all" ON public.profiles;
CREATE POLICY "profiles: hr read all"
  ON public.profiles FOR SELECT
  USING (private.is_hr_admin(auth.uid()));

DROP POLICY IF EXISTS "profiles: hr update all" ON public.profiles;
CREATE POLICY "profiles: hr update all"
  ON public.profiles FOR UPDATE
  USING (private.is_hr_admin(auth.uid()))
  WITH CHECK (private.is_hr_admin(auth.uid()));

-- 5) Extend RLS: HR admin can read + manage non-super grants
DROP POLICY IF EXISTS "role_grants: hr read" ON public.role_grants;
CREATE POLICY "role_grants: hr read"
  ON public.role_grants FOR SELECT
  USING (private.is_hr_admin(auth.uid()));

DROP POLICY IF EXISTS "role_grants: hr insert non-super" ON public.role_grants;
CREATE POLICY "role_grants: hr insert non-super"
  ON public.role_grants FOR INSERT
  WITH CHECK (private.is_hr_admin(auth.uid()) AND COALESCE(is_super_admin, false) = false);

DROP POLICY IF EXISTS "role_grants: hr update non-super" ON public.role_grants;
CREATE POLICY "role_grants: hr update non-super"
  ON public.role_grants FOR UPDATE
  USING (private.is_hr_admin(auth.uid()) AND COALESCE(is_super_admin, false) = false)
  WITH CHECK (private.is_hr_admin(auth.uid()) AND COALESCE(is_super_admin, false) = false);

DROP POLICY IF EXISTS "role_grants: hr delete non-super" ON public.role_grants;
CREATE POLICY "role_grants: hr delete non-super"
  ON public.role_grants FOR DELETE
  USING (private.is_hr_admin(auth.uid()) AND COALESCE(is_super_admin, false) = false);
