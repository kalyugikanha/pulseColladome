## Grant workflow access to anyone with at least one direct report

Right now, only admin / super admin can see and manage workflows (both the sidebar link and the RLS policies on `workflow_templates`, `workflow_template_stages`, and `workflow_instances`). Extend that to any user who is listed as `reporting_manager_id` for at least one active profile.

### 1. DB helper
Add a security-definer function in the `private` schema:
```sql
create or replace function private.has_direct_reports(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where reporting_manager_id = _user_id
      and coalesce(is_active, true) = true
      and id <> _user_id
  );
$$;
```

### 2. RLS updates
Drop-and-recreate the write policies on the three workflow tables so they allow admin OR super_admin OR `private.has_direct_reports(auth.uid())`:
- `workflow_templates.wf_templates_admin_write` (ALL)
- `workflow_template_stages.wf_stages_admin_write` (ALL)
- `workflow_instances.wf_instances_delete_admin` (DELETE)
- `workflow_instances.wf_instances_update_owner_or_admin` (UPDATE) — keep owner clause, add has_direct_reports

SELECT policies stay open (already `true` for authenticated); INSERT on instances stays scoped to `started_by = auth.uid()`.

### 3. Sidebar
`src/routes/_authenticated/route.tsx`: the "Workflows" link condition changes from `(isAdmin || isSuperAdmin)` to `(isAdmin || isSuperAdmin || isReportingManager)`. `isReportingManager` is already computed and passed in — no new query needed.

### Files
- 1 migration for the function + 4 policy replacements.
- `src/routes/_authenticated/route.tsx`: one condition update.

### Assumption
"Single reporting person" = "someone whose reporting_manager_id points at this user" (i.e. this user is the manager of at least one active teammate). Tell me if you meant the inverse (users who themselves have a reporting manager assigned) — that would be nearly everyone and I want to double-check before granting broad workflow write access.
