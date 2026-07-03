INSERT INTO public.role_grants (email, role, is_super_admin, default_monthly_salary)
VALUES ('sweksha.colladome@gmail.com', 'employee', false, 5000)
ON CONFLICT (email) DO UPDATE SET default_monthly_salary = EXCLUDED.default_monthly_salary;

INSERT INTO public.salaries (user_id, monthly_salary, effective_from, currency)
SELECT id, 5000, CURRENT_DATE, 'INR' FROM public.profiles WHERE lower(email) = 'sweksha.colladome@gmail.com'
ON CONFLICT (user_id, effective_from) DO UPDATE SET monthly_salary = EXCLUDED.monthly_salary;