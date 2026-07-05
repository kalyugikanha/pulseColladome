
-- 1. Backfill role_grants departments from profiles (fix "Makreting" typo first)
UPDATE public.profiles SET department = 'Marketing' WHERE department = 'Makreting';

-- Seed role_grants.department from TEAM_ROSTER canonical values
UPDATE public.role_grants g SET department = v.dept FROM (VALUES
  ('arti@colladome.com','Operations'),
  ('shraddha.saxena@colladome.in','HR'),
  ('sweksha@colladome.in','HR'),
  ('akash@colladome.in','Project Management'),
  ('kanishka@colladome.in','Marketing'),
  ('deepak@colladome.in','Marketing'),
  ('sandeep@colladome.in','Marketing'),
  ('anjali@colladome.in','Marketing'),
  ('hemanth@colladome.in','Marketing'),
  ('manvi@colladome.in','Marketing'),
  ('trisha@colladome.in','Marketing'),
  ('jagjeet@colladome.in','Business Development'),
  ('chirag@colladome.com','Business Development'),
  ('juhi@colladome.com','Business Development'),
  ('neetu@colladome.in','Business Development'),
  ('sarita@colladome.in','Business Development'),
  ('riyanshi@colladome.in','Business Development'),
  ('arpit@colladome.in','Development')
) AS v(email, dept)
WHERE g.email = v.email AND (g.department IS NULL OR g.department = '');

-- Fallback: for any remaining null grants, copy from profile department
UPDATE public.role_grants g SET department = p.department
FROM public.profiles p
WHERE g.department IS NULL AND lower(p.email) = lower(g.email) AND p.department IS NOT NULL;

-- Also sync profiles.department from roster where missing
UPDATE public.profiles p SET department = v.dept FROM (VALUES
  ('arti@colladome.com','Operations'),
  ('shraddha.saxena@colladome.in','HR'),
  ('sweksha@colladome.in','HR'),
  ('akash@colladome.in','Project Management'),
  ('kanishka@colladome.in','Marketing'),
  ('deepak@colladome.in','Marketing'),
  ('sandeep@colladome.in','Marketing'),
  ('anjali@colladome.in','Marketing'),
  ('hemanth@colladome.in','Marketing'),
  ('manvi@colladome.in','Marketing'),
  ('trisha@colladome.in','Marketing'),
  ('jagjeet@colladome.in','Business Development'),
  ('chirag@colladome.com','Business Development'),
  ('juhi@colladome.com','Business Development'),
  ('neetu@colladome.in','Business Development'),
  ('sarita@colladome.in','Business Development'),
  ('riyanshi@colladome.in','Business Development'),
  ('arpit@colladome.in','Development')
) AS v(email, dept)
WHERE lower(p.email) = v.email AND (p.department IS NULL OR p.department = '' OR p.department = 'Makreting');

-- 2. department_heads table
CREATE TABLE public.department_heads (
  department text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.department_heads TO authenticated;
GRANT ALL ON public.department_heads TO service_role;
ALTER TABLE public.department_heads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dept_heads: authenticated read" ON public.department_heads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept_heads: super admin manage" ON public.department_heads
  FOR ALL TO authenticated
  USING (private.is_super_admin(auth.uid()))
  WITH CHECK (private.is_super_admin(auth.uid()));

CREATE TRIGGER trg_dept_heads_updated BEFORE UPDATE ON public.department_heads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Helper functions
CREATE OR REPLACE FUNCTION private.user_department(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT department FROM public.profiles WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION private.is_department_head(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.department_heads WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION private.heads_department(_user_id uuid, _department text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_heads
    WHERE user_id = _user_id AND department = _department
  )
$$;

-- Convenience: is the current user a head of the department that _target_user belongs to?
CREATE OR REPLACE FUNCTION private.is_head_of_user(_head uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.department_heads dh
    JOIN public.profiles p ON p.id = _target
    WHERE dh.user_id = _head
      AND dh.department IS NOT NULL
      AND p.department = dh.department
  )
$$;

-- 4. Seed Kanishka as Marketing Head
INSERT INTO public.department_heads (department, user_id)
SELECT 'Marketing', id FROM public.profiles WHERE email = 'kanishka@colladome.in'
ON CONFLICT (department) DO UPDATE SET user_id = EXCLUDED.user_id;

-- 5. Extend RLS policies (additive)

-- profiles: dept head can read + update members of their department
CREATE POLICY "profiles: dept head read" ON public.profiles
  FOR SELECT TO authenticated
  USING (private.is_head_of_user(auth.uid(), id));
CREATE POLICY "profiles: dept head update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (private.is_head_of_user(auth.uid(), id))
  WITH CHECK (private.is_head_of_user(auth.uid(), id));

-- leave_requests: dept head read + update (approve/reject) for their dept
CREATE POLICY "leave: dept head read" ON public.leave_requests
  FOR SELECT TO authenticated
  USING (private.is_head_of_user(auth.uid(), user_id));
CREATE POLICY "leave: dept head decide" ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (private.is_head_of_user(auth.uid(), user_id))
  WITH CHECK (private.is_head_of_user(auth.uid(), user_id));

-- attendance_logs: dept head read + update
CREATE POLICY "attendance: dept head read" ON public.attendance_logs
  FOR SELECT TO authenticated
  USING (private.is_head_of_user(auth.uid(), user_id));
CREATE POLICY "attendance: dept head update" ON public.attendance_logs
  FOR UPDATE TO authenticated
  USING (private.is_head_of_user(auth.uid(), user_id))
  WITH CHECK (private.is_head_of_user(auth.uid(), user_id));

-- punch_sessions: dept head read + update + delete
CREATE POLICY "punch_sessions: dept head read" ON public.punch_sessions
  FOR SELECT TO authenticated
  USING (private.is_head_of_user(auth.uid(), user_id));
CREATE POLICY "punch_sessions: dept head update" ON public.punch_sessions
  FOR UPDATE TO authenticated
  USING (private.is_head_of_user(auth.uid(), user_id))
  WITH CHECK (private.is_head_of_user(auth.uid(), user_id));
CREATE POLICY "punch_sessions: dept head delete" ON public.punch_sessions
  FOR DELETE TO authenticated
  USING (private.is_head_of_user(auth.uid(), user_id));

-- tasks: dept head full manage for their dept's assignees
CREATE POLICY "tasks: dept head read" ON public.tasks
  FOR SELECT TO authenticated
  USING (assignee_id IS NOT NULL AND private.is_head_of_user(auth.uid(), assignee_id));
CREATE POLICY "tasks: dept head insert" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (assignee_id IS NOT NULL AND private.is_head_of_user(auth.uid(), assignee_id));
CREATE POLICY "tasks: dept head update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (assignee_id IS NOT NULL AND private.is_head_of_user(auth.uid(), assignee_id))
  WITH CHECK (assignee_id IS NOT NULL AND private.is_head_of_user(auth.uid(), assignee_id));
CREATE POLICY "tasks: dept head delete" ON public.tasks
  FOR DELETE TO authenticated
  USING (assignee_id IS NOT NULL AND private.is_head_of_user(auth.uid(), assignee_id));

-- projects: dept head read all (needed for assigning tasks & viewing burn)
CREATE POLICY "projects: dept head read" ON public.projects
  FOR SELECT TO authenticated
  USING (private.is_department_head(auth.uid()));
