
ALTER TABLE public.salaries DROP CONSTRAINT IF EXISTS salaries_user_id_fkey;
ALTER TABLE public.salaries ADD CONSTRAINT salaries_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
