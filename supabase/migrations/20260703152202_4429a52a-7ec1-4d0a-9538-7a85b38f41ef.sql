
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
WITH log_input(user_id, project_code, hours) AS (VALUES
  -- Kanishka
  ('11111111-0000-0000-0000-000000000001'::uuid, 'CLDM00527', 40),
  ('11111111-0000-0000-0000-000000000001'::uuid, 'CLDM00521', 10),
  ('11111111-0000-0000-0000-000000000001'::uuid, 'CLDM00563', 5),
  ('11111111-0000-0000-0000-000000000001'::uuid, 'CLDM00102', 30),
  ('11111111-0000-0000-0000-000000000001'::uuid, 'CLDM00000', 40),
  ('11111111-0000-0000-0000-000000000001'::uuid, 'CLDM00564', 20),
  ('11111111-0000-0000-0000-000000000001'::uuid, 'CLDM00522', 60),
  ('11111111-0000-0000-0000-000000000001'::uuid, 'CLDM00529', 25),
  -- Deepak
  ('11111111-0000-0000-0000-000000000002'::uuid, 'CLDM00000', 15),
  ('11111111-0000-0000-0000-000000000002'::uuid, 'CLDM00102', 40),
  ('11111111-0000-0000-0000-000000000002'::uuid, 'CLDM00563', 12),
  ('11111111-0000-0000-0000-000000000002'::uuid, 'CLDM00527', 60),
  ('11111111-0000-0000-0000-000000000002'::uuid, 'CLDM00522', 40),
  ('11111111-0000-0000-0000-000000000002'::uuid, 'CLDM00481', 45),
  -- Sandeep (real)
  ('38290b50-49a9-4af3-9f3f-a052497d63cb'::uuid, 'CLDM00103', 15),
  ('38290b50-49a9-4af3-9f3f-a052497d63cb'::uuid, 'CLDM00000', 45),
  ('38290b50-49a9-4af3-9f3f-a052497d63cb'::uuid, 'CLDM00102', 100),
  ('38290b50-49a9-4af3-9f3f-a052497d63cb'::uuid, 'CLDM00522', 20),
  ('38290b50-49a9-4af3-9f3f-a052497d63cb'::uuid, 'CLDM00527', 20),
  -- Sharaddha
  ('11111111-0000-0000-0000-000000000003'::uuid, 'CLDM00565', 50),
  ('11111111-0000-0000-0000-000000000003'::uuid, 'CLDM00101', 50),
  ('11111111-0000-0000-0000-000000000003'::uuid, 'CLDM00104', 50),
  ('11111111-0000-0000-0000-000000000003'::uuid, 'CLDM00568', 50),
  -- Arti (real)
  ('9869d739-4e1d-4904-a145-89ce230a708b'::uuid, 'CLDM00568', 50),
  ('9869d739-4e1d-4904-a145-89ce230a708b'::uuid, 'CLDM00104', 25),
  ('9869d739-4e1d-4904-a145-89ce230a708b'::uuid, 'CLDM00565', 25),
  ('9869d739-4e1d-4904-a145-89ce230a708b'::uuid, 'CLDM00566', 50),
  ('9869d739-4e1d-4904-a145-89ce230a708b'::uuid, 'CLDM00101', 50),
  -- Akash
  ('11111111-0000-0000-0000-000000000004'::uuid, 'CLDM00524', 30),
  ('11111111-0000-0000-0000-000000000004'::uuid, 'CLDM00418', 20),
  ('11111111-0000-0000-0000-000000000004'::uuid, 'CLDM00514', 40),
  ('11111111-0000-0000-0000-000000000004'::uuid, 'CLDM00481', 20),
  ('11111111-0000-0000-0000-000000000004'::uuid, 'CLDM00523', 8),
  ('11111111-0000-0000-0000-000000000004'::uuid, 'CLDM00503', 20),
  ('11111111-0000-0000-0000-000000000004'::uuid, 'CLDM00414', 4),
  ('11111111-0000-0000-0000-000000000004'::uuid, 'CLDM00504', 10),
  ('11111111-0000-0000-0000-000000000004'::uuid, 'CLDM00392', 5),
  ('11111111-0000-0000-0000-000000000004'::uuid, 'CLDM00547', 50),
  ('11111111-0000-0000-0000-000000000004'::uuid, 'CLDM00527', 3),
  ('11111111-0000-0000-0000-000000000004'::uuid, 'CLDM00102', 50),
  ('11111111-0000-0000-0000-000000000004'::uuid, 'CLDM00101', 50),
  -- Sweksha
  ('11111111-0000-0000-0000-000000000005'::uuid, 'CLDM00104', 150),
  ('11111111-0000-0000-0000-000000000005'::uuid, 'CLDM00567', 50),
  -- Jagjeet (real)
  ('58c14ca5-6594-417a-84c9-5a22f19d13b4'::uuid, 'CLDM00567', 100),
  ('58c14ca5-6594-417a-84c9-5a22f19d13b4'::uuid, 'CLDM00104', 100),
  -- Juhi
  ('11111111-0000-0000-0000-000000000007'::uuid, 'CLDM00527', 200),
  -- Anjali
  ('11111111-0000-0000-0000-000000000008'::uuid, 'CLDM00103', 100),
  ('11111111-0000-0000-0000-000000000008'::uuid, 'CLDM00000', 148),
  -- Neetu
  ('11111111-0000-0000-0000-000000000009'::uuid, 'CLDM00000', 200),
  -- Sridhar
  ('11111111-0000-0000-0000-000000000010'::uuid, 'CLDM00000', 120),
  -- Manvi
  ('11111111-0000-0000-0000-000000000011'::uuid, 'CLDM00000', 42),
  -- Trisha
  ('11111111-0000-0000-0000-000000000012'::uuid, 'CLDM00000', 75),
  -- Sandhya
  ('11111111-0000-0000-0000-000000000013'::uuid, 'CLDM00521', 10),
  ('11111111-0000-0000-0000-000000000013'::uuid, 'CLDM00512', 4),
  -- Shaleen
  ('11111111-0000-0000-0000-000000000014'::uuid, 'CLDM00103', 30),
  ('11111111-0000-0000-0000-000000000014'::uuid, 'CLDM00522', 60)
),
agg AS (
  SELECT
    li.user_id,
    SUM(li.hours)::numeric AS total,
    jsonb_agg(jsonb_build_object(
      'project_code', li.project_code,
      'project_name', p.name,
      'hours', li.hours
    )) AS tasks
  FROM log_input li
  JOIN public.projects p ON p.code = li.project_code
  GROUP BY li.user_id
)
INSERT INTO public.attendance_logs (user_id, date, total_hours, tasks)
SELECT user_id, DATE '2026-06-01', total, tasks FROM agg
ON CONFLICT (user_id, date) DO UPDATE
  SET tasks = EXCLUDED.tasks, total_hours = EXCLUDED.total_hours;
