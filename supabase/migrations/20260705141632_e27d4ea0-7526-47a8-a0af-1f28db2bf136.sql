
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reporting_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_reporting_manager_id_idx ON public.profiles(reporting_manager_id);

CREATE OR REPLACE FUNCTION private.is_reporting_manager_of(_manager uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _target AND reporting_manager_id = _manager
  );
$$;

-- profiles
CREATE POLICY "profiles: reporting manager read" ON public.profiles
  FOR SELECT TO authenticated
  USING (private.is_reporting_manager_of(auth.uid(), id));

CREATE POLICY "profiles: reporting manager update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (private.is_reporting_manager_of(auth.uid(), id))
  WITH CHECK (private.is_reporting_manager_of(auth.uid(), id));

-- attendance_logs
CREATE POLICY "attendance: reporting manager read" ON public.attendance_logs
  FOR SELECT TO authenticated
  USING (private.is_reporting_manager_of(auth.uid(), user_id));

CREATE POLICY "attendance: reporting manager update" ON public.attendance_logs
  FOR UPDATE TO authenticated
  USING (private.is_reporting_manager_of(auth.uid(), user_id))
  WITH CHECK (private.is_reporting_manager_of(auth.uid(), user_id));

-- leave_requests
CREATE POLICY "leave: reporting manager read" ON public.leave_requests
  FOR SELECT TO authenticated
  USING (private.is_reporting_manager_of(auth.uid(), user_id));

CREATE POLICY "leave: reporting manager decide" ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (private.is_reporting_manager_of(auth.uid(), user_id))
  WITH CHECK (private.is_reporting_manager_of(auth.uid(), user_id));

-- punch_sessions
CREATE POLICY "punch_sessions: reporting manager read" ON public.punch_sessions
  FOR SELECT TO authenticated
  USING (private.is_reporting_manager_of(auth.uid(), user_id));

CREATE POLICY "punch_sessions: reporting manager update" ON public.punch_sessions
  FOR UPDATE TO authenticated
  USING (private.is_reporting_manager_of(auth.uid(), user_id))
  WITH CHECK (private.is_reporting_manager_of(auth.uid(), user_id));

CREATE POLICY "punch_sessions: reporting manager delete" ON public.punch_sessions
  FOR DELETE TO authenticated
  USING (private.is_reporting_manager_of(auth.uid(), user_id));

-- tasks (assignee-based scoping)
CREATE POLICY "tasks: reporting manager read" ON public.tasks
  FOR SELECT TO authenticated
  USING (assignee_id IS NOT NULL AND private.is_reporting_manager_of(auth.uid(), assignee_id));

CREATE POLICY "tasks: reporting manager insert" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (assignee_id IS NOT NULL AND private.is_reporting_manager_of(auth.uid(), assignee_id));

CREATE POLICY "tasks: reporting manager update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (assignee_id IS NOT NULL AND private.is_reporting_manager_of(auth.uid(), assignee_id))
  WITH CHECK (assignee_id IS NOT NULL AND private.is_reporting_manager_of(auth.uid(), assignee_id));

CREATE POLICY "tasks: reporting manager delete" ON public.tasks
  FOR DELETE TO authenticated
  USING (assignee_id IS NOT NULL AND private.is_reporting_manager_of(auth.uid(), assignee_id));
