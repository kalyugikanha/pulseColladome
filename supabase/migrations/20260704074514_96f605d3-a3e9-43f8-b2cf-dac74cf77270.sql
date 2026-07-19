
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='admin')
    OR EXISTS(SELECT 1 FROM public.super_admins WHERE user_id=_user_id);
$$;

CREATE OR REPLACE FUNCTION private.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.super_admins WHERE user_id=_user_id);
$$;

CREATE OR REPLACE FUNCTION private.is_finance_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=_user_id AND lower(email)='shubham@colladome.com');
$$;

CREATE OR REPLACE FUNCTION private.can_manage_projects(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_admin(_user_id) OR private.has_role(_user_id, 'project_manager');
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_super_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_finance_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_projects(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_super_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_finance_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_projects(uuid) TO authenticated, service_role;

-- Recreate policies to reference private.*
DROP POLICY "profiles: admin update all" ON public.profiles;
CREATE POLICY "profiles: admin update all" ON public.profiles FOR UPDATE TO authenticated USING (private.is_admin(auth.uid()));
DROP POLICY "profiles: read own or admin" ON public.profiles;
CREATE POLICY "profiles: read own or admin" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid()=id) OR private.is_admin(auth.uid()));
DROP POLICY "Super admins manage all profiles" ON public.profiles;
CREATE POLICY "Super admins manage all profiles" ON public.profiles FOR ALL TO authenticated USING (private.is_super_admin(auth.uid())) WITH CHECK (private.is_super_admin(auth.uid()));

DROP POLICY "user_roles: admin view all" ON public.user_roles;
CREATE POLICY "user_roles: admin view all" ON public.user_roles FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
DROP POLICY "user_roles: admin manage" ON public.user_roles;
CREATE POLICY "user_roles: admin manage" ON public.user_roles FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY "attendance: admin read all" ON public.attendance_logs;
CREATE POLICY "attendance: admin read all" ON public.attendance_logs FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
DROP POLICY "Super admins manage all attendance" ON public.attendance_logs;
CREATE POLICY "Super admins manage all attendance" ON public.attendance_logs FOR ALL TO authenticated USING (private.is_super_admin(auth.uid())) WITH CHECK (private.is_super_admin(auth.uid()));
DROP POLICY "Project managers manage all attendance" ON public.attendance_logs;
CREATE POLICY "Project managers manage all attendance" ON public.attendance_logs FOR ALL TO authenticated USING (private.can_manage_projects(auth.uid())) WITH CHECK (private.can_manage_projects(auth.uid()));

DROP POLICY "balances: admin read all" ON public.leave_balances;
CREATE POLICY "balances: admin read all" ON public.leave_balances FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
DROP POLICY "balances: admin manage" ON public.leave_balances;
CREATE POLICY "balances: admin manage" ON public.leave_balances FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY "leave: admin read all" ON public.leave_requests;
CREATE POLICY "leave: admin read all" ON public.leave_requests FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
DROP POLICY "leave: admin manage" ON public.leave_requests;
CREATE POLICY "leave: admin manage" ON public.leave_requests FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY "super_admins: super manage" ON public.super_admins;
CREATE POLICY "super_admins: super manage" ON public.super_admins FOR ALL TO authenticated USING (private.is_super_admin(auth.uid())) WITH CHECK (private.is_super_admin(auth.uid()));

DROP POLICY "role_grants: super manage" ON public.role_grants;
CREATE POLICY "role_grants: super manage" ON public.role_grants FOR ALL TO authenticated USING (private.is_super_admin(auth.uid())) WITH CHECK (private.is_super_admin(auth.uid()));

DROP POLICY "punch_sessions: admin read" ON public.punch_sessions;
CREATE POLICY "punch_sessions: admin read" ON public.punch_sessions FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));

DROP POLICY "salaries: finance read" ON public.salaries;
CREATE POLICY "salaries: finance read" ON public.salaries FOR SELECT TO authenticated USING (private.is_finance_admin(auth.uid()));
DROP POLICY "salaries: finance insert" ON public.salaries;
CREATE POLICY "salaries: finance insert" ON public.salaries FOR INSERT TO authenticated WITH CHECK (private.is_finance_admin(auth.uid()));
DROP POLICY "salaries: finance update" ON public.salaries;
CREATE POLICY "salaries: finance update" ON public.salaries FOR UPDATE TO authenticated USING (private.is_finance_admin(auth.uid())) WITH CHECK (private.is_finance_admin(auth.uid()));
DROP POLICY "salaries: finance delete" ON public.salaries;
CREATE POLICY "salaries: finance delete" ON public.salaries FOR DELETE TO authenticated USING (private.is_finance_admin(auth.uid()));

DROP POLICY "holidays: super manage" ON public.holidays;
CREATE POLICY "holidays: super manage" ON public.holidays FOR ALL TO authenticated USING (private.is_super_admin(auth.uid())) WITH CHECK (private.is_super_admin(auth.uid()));

DROP POLICY "projects: manager manage" ON public.projects;
CREATE POLICY "projects: manager manage" ON public.projects FOR ALL TO authenticated USING (private.can_manage_projects(auth.uid())) WITH CHECK (private.can_manage_projects(auth.uid()));
DROP POLICY "projects: read involved or manager" ON public.projects;
CREATE POLICY "projects: read involved or manager" ON public.projects FOR SELECT TO authenticated USING (
  private.can_manage_projects(auth.uid())
  OR (created_by = auth.uid())
  OR EXISTS(SELECT 1 FROM public.tasks t WHERE t.project_id = projects.id AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid()))
);

DROP POLICY "tasks: manager manage" ON public.tasks;
CREATE POLICY "tasks: manager manage" ON public.tasks FOR ALL TO authenticated USING (private.can_manage_projects(auth.uid())) WITH CHECK (private.can_manage_projects(auth.uid()));
DROP POLICY "tasks: read involved or manager" ON public.tasks;
CREATE POLICY "tasks: read involved or manager" ON public.tasks FOR SELECT TO authenticated USING (
  private.can_manage_projects(auth.uid()) OR (assignee_id = auth.uid()) OR (created_by = auth.uid())
);

DROP POLICY "vendors: super admin manage" ON public.vendors;
CREATE POLICY "vendors: super admin manage" ON public.vendors FOR ALL TO authenticated USING (private.is_super_admin(auth.uid())) WITH CHECK (private.is_super_admin(auth.uid()));

DROP POLICY "vendor_payments: super admin manage" ON public.vendor_payments;
CREATE POLICY "vendor_payments: super admin manage" ON public.vendor_payments FOR ALL TO authenticated USING (private.is_super_admin(auth.uid())) WITH CHECK (private.is_super_admin(auth.uid()));

DROP POLICY "Super admins can view all google tokens" ON public.google_calendar_tokens;
CREATE POLICY "Super admins can view all google tokens" ON public.google_calendar_tokens FOR SELECT TO authenticated USING (private.is_super_admin(auth.uid()));

DROP POLICY "admin manage department_settings" ON public.department_settings;
CREATE POLICY "admin manage department_settings" ON public.department_settings FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

-- Update helper RPC that referenced public.is_admin
CREATE OR REPLACE FUNCTION public.admin_get_leave_requests(_status public.leave_status DEFAULT NULL)
RETURNS SETOF public.leave_requests LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT * FROM public.leave_requests
  WHERE private.is_admin(auth.uid())
    AND (_status IS NULL OR status = _status)
  ORDER BY created_at DESC;
$$;

-- Drop old public helpers now that nothing references them
DROP FUNCTION public.is_admin(uuid);
DROP FUNCTION public.has_role(uuid, public.app_role);
DROP FUNCTION public.is_super_admin(uuid);
DROP FUNCTION public.is_finance_admin(uuid);
DROP FUNCTION public.can_manage_projects(uuid);
