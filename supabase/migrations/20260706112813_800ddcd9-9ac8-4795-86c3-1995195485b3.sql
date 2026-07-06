
ALTER TABLE public.salaries
  ADD COLUMN IF NOT EXISTS comp_type text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(12,2);

ALTER TABLE public.salaries ALTER COLUMN monthly_salary DROP NOT NULL;

ALTER TABLE public.salaries DROP CONSTRAINT IF EXISTS salaries_monthly_salary_check;
ALTER TABLE public.salaries DROP CONSTRAINT IF EXISTS salaries_comp_type_check;
ALTER TABLE public.salaries DROP CONSTRAINT IF EXISTS salaries_comp_values_check;

ALTER TABLE public.salaries
  ADD CONSTRAINT salaries_comp_type_check CHECK (comp_type IN ('monthly','hourly')),
  ADD CONSTRAINT salaries_comp_values_check CHECK (
    (comp_type = 'monthly' AND monthly_salary IS NOT NULL AND monthly_salary >= 0)
    OR
    (comp_type = 'hourly' AND hourly_rate IS NOT NULL AND hourly_rate >= 0)
  );

ALTER TABLE public.role_grants
  ADD COLUMN IF NOT EXISTS comp_type text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS default_hourly_rate numeric(12,2);

ALTER TABLE public.role_grants DROP CONSTRAINT IF EXISTS role_grants_comp_type_check;
ALTER TABLE public.role_grants
  ADD CONSTRAINT role_grants_comp_type_check CHECK (comp_type IN ('monthly','hourly'));
