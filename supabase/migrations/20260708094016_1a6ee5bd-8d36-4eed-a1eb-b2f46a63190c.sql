
create or replace function private.has_direct_reports(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where reporting_manager_id = _user_id
      and coalesce(is_active, true) = true
      and id <> _user_id
  );
$$;

-- workflow_templates
drop policy if exists wf_templates_admin_write on public.workflow_templates;
create policy wf_templates_admin_write on public.workflow_templates
  for all to authenticated
  using (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
    OR private.has_direct_reports(auth.uid())
  )
  with check (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
    OR private.has_direct_reports(auth.uid())
  );

-- workflow_template_stages
drop policy if exists wf_stages_admin_write on public.workflow_template_stages;
create policy wf_stages_admin_write on public.workflow_template_stages
  for all to authenticated
  using (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
    OR private.has_direct_reports(auth.uid())
  )
  with check (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
    OR private.has_direct_reports(auth.uid())
  );

-- workflow_instances DELETE
drop policy if exists wf_instances_delete_admin on public.workflow_instances;
create policy wf_instances_delete_admin on public.workflow_instances
  for delete to authenticated
  using (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
    OR private.has_direct_reports(auth.uid())
  );

-- workflow_instances UPDATE (keep owner)
drop policy if exists wf_instances_update_owner_or_admin on public.workflow_instances;
create policy wf_instances_update_owner_or_admin on public.workflow_instances
  for update to authenticated
  using (
    started_by = auth.uid()
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
    OR private.has_direct_reports(auth.uid())
  )
  with check (
    started_by = auth.uid()
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
    OR private.has_direct_reports(auth.uid())
  );
