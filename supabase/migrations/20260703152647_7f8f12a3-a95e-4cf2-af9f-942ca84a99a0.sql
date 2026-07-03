CREATE POLICY "Project managers manage all attendance"
ON public.attendance_logs
FOR ALL
TO authenticated
USING (public.can_manage_projects(auth.uid()))
WITH CHECK (public.can_manage_projects(auth.uid()));