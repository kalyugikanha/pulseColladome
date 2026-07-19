
-- Helper: is user on the BD team?
CREATE OR REPLACE FUNCTION private.is_bd_team(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _uid AND lower(coalesce(p.department, '')) = 'business development'
  )
  OR EXISTS (
    SELECT 1 FROM public.department_heads dh
    WHERE dh.user_id = _uid AND lower(dh.department) = 'business development'
  );
$$;

-- Open marketing kanban rows to all authenticated users
DROP POLICY IF EXISTS "tasks: marketing kanban read all" ON public.tasks;
CREATE POLICY "tasks: marketing kanban read all" ON public.tasks
  FOR SELECT TO authenticated
  USING (marketing_stage IS NOT NULL);

-- Restrictive gate: hide BD-department tasks from non-BD viewers
DROP POLICY IF EXISTS "tasks: bd restrictive read" ON public.tasks;
CREATE POLICY "tasks: bd restrictive read" ON public.tasks
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    department_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.taxonomy_departments d
      WHERE d.id = tasks.department_id
        AND lower(d.name) = 'business development'
    )
    OR private.is_bd_team(auth.uid())
    OR private.is_admin(auth.uid())
    OR private.is_super_admin(auth.uid())
    OR private.is_hr_admin(auth.uid())
    OR private.can_manage_projects(auth.uid())
  );
