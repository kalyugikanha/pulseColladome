## Give department heads full taxonomy access

Currently the Taxonomy page (Domains / Departments / Task Types) is gated to super admins in the UI, and RLS only allows `admin` role to write. Kanishka (Marketing Head) can't reach or edit it.

### Changes

**1. Migration** — extend RLS write policies on `taxonomy_domains`, `taxonomy_departments`, `taxonomy_task_types` so department heads (anyone with a row in `public.department_heads`) can INSERT / UPDATE / DELETE, in addition to admins. Reads already allow all authenticated users.

**2. Frontend gate** — in `src/routes/_authenticated/admin.taxonomy.tsx`, change the guard from `isSuperAdmin || isAdmin` to also allow `isDepartmentHead`.

**3. Sidebar** — add Taxonomy to the admin group for department heads too (currently likely admin-only).

No changes to server functions — they run under the caller's Supabase session, so RLS handles authorization.

### Verification

View as Kanishka → Admin sidebar shows Taxonomy → open it, add/rename/delete a domain, department, and task type without permission errors.
