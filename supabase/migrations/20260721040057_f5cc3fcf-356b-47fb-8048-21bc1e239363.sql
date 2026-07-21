
-- 1. Tighten bde_sequences: restrict SELECT and INSERT to authenticated with ownership/admin check
DROP POLICY IF EXISTS "Public read bde_sequences" ON public.bde_sequences;
DROP POLICY IF EXISTS "Authenticated insert bde_sequences" ON public.bde_sequences;

CREATE POLICY "bde_sequences read own or admin"
ON public.bde_sequences
FOR SELECT
TO authenticated
USING (
  lower(coalesce(generated_by_email, '')) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  OR private.is_admin(auth.uid())
  OR private.is_super_admin(auth.uid())
);

CREATE POLICY "bde_sequences insert own"
ON public.bde_sequences
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND lower(coalesce(generated_by_email, '')) = lower(coalesce((auth.jwt() ->> 'email'), ''))
);

-- 2. Add explicit self-insert policy for onboarding_section_state so employees can seed their own rows
CREATE POLICY "user inserts own onboarding sections"
ON public.onboarding_section_state
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 3. Remove hardcoded default bank debit account number from payroll_settings
ALTER TABLE public.payroll_settings ALTER COLUMN debit_account_number DROP DEFAULT;

-- 4. Revoke EXECUTE on the cron-only recurring task generator from public/authenticated
REVOKE EXECUTE ON FUNCTION public.generate_recurring_task_occurrences() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_task_occurrences() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_task_occurrences() FROM anon;
