
-- 1. Relax FKs so we can seed name-only teammates without auth accounts.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_user_id_fkey;
ALTER TABLE public.attendance_logs
  ADD CONSTRAINT attendance_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Add profile helper columns.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_placeholder boolean NOT NULL DEFAULT false;

-- 3. Super-admin RLS: manage all attendance and profiles.
DROP POLICY IF EXISTS "Super admins manage all attendance" ON public.attendance_logs;
CREATE POLICY "Super admins manage all attendance" ON public.attendance_logs
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins manage all profiles" ON public.profiles;
CREATE POLICY "Super admins manage all profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 4. Update existing profiles with departments.
UPDATE public.profiles SET department = 'Admin' WHERE lower(email) = 'arti@colladome.com';
UPDATE public.profiles SET department = 'Business Development' WHERE lower(email) = 'jagjeet@colladome.in';
UPDATE public.profiles SET department = 'Finance' WHERE lower(email) = 'shubham@colladome.com';

-- 5. Seed placeholder profiles for teammates without accounts yet.
INSERT INTO public.profiles (id, full_name, email, department, is_placeholder, must_change_password) VALUES
  ('11111111-0000-0000-0000-000000000001','Kanishka','kanishka@placeholder.colladome.local','Marketing',true,false),
  ('11111111-0000-0000-0000-000000000002','Deepak','deepak@placeholder.colladome.local','Designer',true,false),
  ('11111111-0000-0000-0000-000000000003','Sharaddha','sharaddha@placeholder.colladome.local','Admin',true,false),
  ('11111111-0000-0000-0000-000000000004','Akash','akash-mock@placeholder.colladome.local','Project Manager',true,false),
  ('11111111-0000-0000-0000-000000000005','Sweksha','sweksha@placeholder.colladome.local',null,true,false),
  ('11111111-0000-0000-0000-000000000006','Chirag','chirag@placeholder.colladome.local','Business Development',true,false),
  ('11111111-0000-0000-0000-000000000007','Juhi','juhi@placeholder.colladome.local','Business Development',true,false),
  ('11111111-0000-0000-0000-000000000008','Anjali','anjali@placeholder.colladome.local','Designer',true,false),
  ('11111111-0000-0000-0000-000000000009','Neetu','neetu@placeholder.colladome.local','Business Development',true,false),
  ('11111111-0000-0000-0000-000000000010','Sridhar Hemanth','sridhar@placeholder.colladome.local','Video Editor',true,false),
  ('11111111-0000-0000-0000-000000000011','Manvi','manvi@placeholder.colladome.local','Marketing',true,false),
  ('11111111-0000-0000-0000-000000000012','Trisha','trisha@placeholder.colladome.local','Marketing',true,false),
  ('11111111-0000-0000-0000-000000000013','Sandhya','sandhya@placeholder.colladome.local','Designer',true,false),
  ('11111111-0000-0000-0000-000000000014','Shaleen','shaleen@placeholder.colladome.local','Marketing',true,false)
ON CONFLICT (id) DO NOTHING;

-- 6. Seed June 2026 hours per user/project (one row per user on 2026-06-01).
-- Seed removed to prevent FK errors in empty db
