
-- 1. punch_sessions table
CREATE TABLE IF NOT EXISTS public.punch_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  punch_in_time timestamptz NOT NULL DEFAULT now(),
  punch_out_time timestamptz,
  hours numeric(5,2),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  project_code text,
  project_name text,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS punch_sessions_user_date_idx ON public.punch_sessions(user_id, session_date);
CREATE INDEX IF NOT EXISTS punch_sessions_date_idx ON public.punch_sessions(session_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.punch_sessions TO authenticated;
GRANT ALL ON public.punch_sessions TO service_role;

ALTER TABLE public.punch_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "punch_sessions: own read" ON public.punch_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "punch_sessions: admin read" ON public.punch_sessions
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "punch_sessions: own insert" ON public.punch_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "punch_sessions: own update" ON public.punch_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "punch_sessions: own delete" ON public.punch_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER punch_sessions_set_updated_at BEFORE UPDATE ON public.punch_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. is_finance_admin: restrict to specific emails
CREATE OR REPLACE FUNCTION public.is_finance_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND lower(email) IN ('shubham@colladome.com', 'arti@colladome.com')
  );
$$;

-- 3. Replace salaries policies to use is_finance_admin
DROP POLICY IF EXISTS "salaries: super admin read" ON public.salaries;
DROP POLICY IF EXISTS "salaries: super admin insert" ON public.salaries;
DROP POLICY IF EXISTS "salaries: super admin update" ON public.salaries;
DROP POLICY IF EXISTS "salaries: super admin delete" ON public.salaries;

CREATE POLICY "salaries: finance read" ON public.salaries
  FOR SELECT TO authenticated USING (public.is_finance_admin(auth.uid()));
CREATE POLICY "salaries: finance insert" ON public.salaries
  FOR INSERT TO authenticated WITH CHECK (public.is_finance_admin(auth.uid()));
CREATE POLICY "salaries: finance update" ON public.salaries
  FOR UPDATE TO authenticated USING (public.is_finance_admin(auth.uid())) WITH CHECK (public.is_finance_admin(auth.uid()));
CREATE POLICY "salaries: finance delete" ON public.salaries
  FOR DELETE TO authenticated USING (public.is_finance_admin(auth.uid()));
