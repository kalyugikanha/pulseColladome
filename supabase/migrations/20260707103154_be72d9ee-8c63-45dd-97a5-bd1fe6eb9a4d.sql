
DROP POLICY IF EXISTS "wf_instances_write_any_signed" ON public.workflow_instances;

CREATE POLICY "wf_instances_insert_self" ON public.workflow_instances
  FOR INSERT TO authenticated
  WITH CHECK (started_by = auth.uid());

CREATE POLICY "wf_instances_update_owner_or_admin" ON public.workflow_instances
  FOR UPDATE TO authenticated
  USING (started_by = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()))
  WITH CHECK (started_by = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

CREATE POLICY "wf_instances_delete_admin" ON public.workflow_instances
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));
