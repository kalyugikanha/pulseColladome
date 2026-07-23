INSERT INTO public.user_roles (user_id, role)
SELECT id, 'finance_admin'::public.app_role FROM public.profiles WHERE lower(email) = 'shubham@colladome.com'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_grants (email, role)
VALUES ('shubham@colladome.com', 'finance_admin'::public.app_role)
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;