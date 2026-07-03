
-- Restrict profiles SELECT to self + admins
DROP POLICY IF EXISTS "profiles: read all authenticated" ON public.profiles;
CREATE POLICY "profiles: read own or admin"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- Restrict projects SELECT to admins, creators, and users assigned to tasks in the project
DROP POLICY IF EXISTS "projects: read all authenticated" ON public.projects;
CREATE POLICY "projects: read involved or admin"
  ON public.projects FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.project_id = projects.id
        AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid())
    )
  );

-- Restrict tasks SELECT to admins, assignees, and creators
DROP POLICY IF EXISTS "tasks: read all authenticated" ON public.tasks;
CREATE POLICY "tasks: read involved or admin"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR assignee_id = auth.uid()
    OR created_by = auth.uid()
  );
