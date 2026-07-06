## Goal
Confirm that Aakash (`akash@colladome.in`, role `project_manager`) can actually create and modify projects against the live database — not just see the UI under super-admin view-as.

## Approach
We can't log in as Aakash from the sandbox (Google SSO only), so verify at two layers:

### 1. Database layer (simulated as Aakash)
Using psql with RLS as the `authenticated` role and Aakash's `auth.uid()`:

```sql
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"<aakash-uuid>","role":"authenticated"}';
SELECT private.can_manage_projects(auth.uid());   -- expect true
INSERT INTO public.projects (name, code, created_by) VALUES ('RLS smoke test', 'RLS-TEST', auth.uid()) RETURNING id;
UPDATE public.projects SET description = 'edited by aakash' WHERE code = 'RLS-TEST';
DELETE FROM public.projects WHERE code = 'RLS-TEST';
```
Pass = INSERT/UPDATE/DELETE all succeed. Fail = capture the exact `permission denied` / RLS error.

### 2. Frontend layer
- Confirm `useCurrentUser` returns `canManageProjects: true` for Aakash's session (visible via the "New Project" button + row action icons on `/projects`).
- Since the developer is currently on a super-admin session using view-as, the New Project dialog and Edit row buttons should already be visible on `/projects`. That confirms the UI path but not the DB path (queries still run as the super-admin).

### 3. Report back
- If DB step passes: tell the user Aakash is fully unblocked; ask him to hard-refresh / sign out & back in to clear any stale session.
- If DB step fails: capture the error, then propose a targeted fix (likely a missing GRANT or a policy tweak on `projects` or the `private.*` helpers).

## Out of scope
No code or migration changes in this step — this is verification only. Any fix will be proposed as a follow-up plan based on what the check returns.
