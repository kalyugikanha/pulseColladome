
-- 1) Super-admin-only RPC to list every profile for the View-as picker
CREATE OR REPLACE FUNCTION public.list_all_profiles_for_super_admin()
RETURNS TABLE(id uuid, full_name text, email text, department text, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins may list all profiles.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.department, p.is_active
    FROM public.profiles p
    ORDER BY p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_all_profiles_for_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_all_profiles_for_super_admin() TO authenticated;

-- 2) Internal audit log for impersonated writes
CREATE TABLE IF NOT EXISTS public.impersonation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  real_user_id uuid NOT NULL,
  acting_user_id uuid NOT NULL,
  function_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.impersonation_audit TO authenticated;
GRANT ALL ON public.impersonation_audit TO service_role;

ALTER TABLE public.impersonation_audit ENABLE ROW LEVEL SECURITY;

-- Only super admins can read the audit log
CREATE POLICY "Super admins can read impersonation audit"
  ON public.impersonation_audit
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));

-- Only super admins can insert audit rows, and only for themselves as real_user_id
CREATE POLICY "Super admins can insert impersonation audit for themselves"
  ON public.impersonation_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (
    real_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS impersonation_audit_real_created_at_idx
  ON public.impersonation_audit (real_user_id, created_at DESC);
