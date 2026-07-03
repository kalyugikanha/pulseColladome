CREATE OR REPLACE FUNCTION public.can_manage_projects(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id) OR public.has_role(_user_id, 'project_manager');
$$;

DROP POLICY IF EXISTS "projects: admin manage" ON public.projects;
DROP POLICY IF EXISTS "projects: read involved or admin" ON public.projects;

CREATE POLICY "projects: manager manage" ON public.projects
  FOR ALL
  USING (public.can_manage_projects(auth.uid()))
  WITH CHECK (public.can_manage_projects(auth.uid()));

CREATE POLICY "projects: read involved or manager" ON public.projects
  FOR SELECT
  USING (
    public.can_manage_projects(auth.uid())
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.project_id = projects.id
        AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "tasks: admin manage" ON public.tasks;
DROP POLICY IF EXISTS "tasks: read involved or admin" ON public.tasks;

CREATE POLICY "tasks: manager manage" ON public.tasks
  FOR ALL
  USING (public.can_manage_projects(auth.uid()))
  WITH CHECK (public.can_manage_projects(auth.uid()));

CREATE POLICY "tasks: read involved or manager" ON public.tasks
  FOR SELECT
  USING (
    public.can_manage_projects(auth.uid())
    OR assignee_id = auth.uid()
    OR created_by = auth.uid()
  );

UPDATE public.role_grants SET role = 'project_manager' WHERE lower(email) = 'akash@colladome.in';