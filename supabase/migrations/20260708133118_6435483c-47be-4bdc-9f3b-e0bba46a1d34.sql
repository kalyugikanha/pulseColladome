
-- 1) Super admin RW on employee_bank_details
CREATE POLICY "bank: super admin write" ON public.employee_bank_details
  FOR INSERT TO authenticated
  WITH CHECK (private.is_super_admin(auth.uid()));
CREATE POLICY "bank: super admin update" ON public.employee_bank_details
  FOR UPDATE TO authenticated
  USING (private.is_super_admin(auth.uid()))
  WITH CHECK (private.is_super_admin(auth.uid()));
CREATE POLICY "bank: super admin delete" ON public.employee_bank_details
  FOR DELETE TO authenticated
  USING (private.is_super_admin(auth.uid()));

-- 2) payroll_settings singleton
CREATE TABLE public.payroll_settings (
  id text PRIMARY KEY DEFAULT 'default',
  debit_account_number text NOT NULL DEFAULT '78142495151',
  pay_date_offset_days integer NOT NULL DEFAULT 10,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_settings_singleton CHECK (id = 'default')
);

GRANT SELECT, INSERT, UPDATE ON public.payroll_settings TO authenticated;
GRANT ALL ON public.payroll_settings TO service_role;

ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_settings: super admin read" ON public.payroll_settings
  FOR SELECT TO authenticated
  USING (private.is_super_admin(auth.uid()));
CREATE POLICY "payroll_settings: super admin write" ON public.payroll_settings
  FOR INSERT TO authenticated
  WITH CHECK (private.is_super_admin(auth.uid()));
CREATE POLICY "payroll_settings: super admin update" ON public.payroll_settings
  FOR UPDATE TO authenticated
  USING (private.is_super_admin(auth.uid()))
  WITH CHECK (private.is_super_admin(auth.uid()));

CREATE TRIGGER payroll_settings_updated_at
  BEFORE UPDATE ON public.payroll_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.payroll_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;
