
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS joined_on date;

CREATE TABLE IF NOT EXISTS public.department_settings (
  name text PRIMARY KEY,
  color text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.department_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.department_settings TO authenticated;
GRANT ALL ON public.department_settings TO service_role;
ALTER TABLE public.department_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read department_settings" ON public.department_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage department_settings" ON public.department_settings
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER dept_settings_updated BEFORE UPDATE ON public.department_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
