## Problem

For non-admin managers (e.g. Kanishka), two dropdowns only show their direct reports:

1. **New Task dialog** (`src/routes/_authenticated/tasks.tsx`) — assignee picker.
2. **Workflow template editor** (`src/routes/_authenticated/workflows.tsx`) — "Default assignee" and "Default reviewer" pickers on each stage.

Both queries hit `profiles` directly via the browser Supabase client, so the profiles RLS policy (which limits a manager to self + direct reports) filters the roster. Admins / super admins see everyone because RLS lets them.

## Fix

Introduce a security-definer RPC that returns the full roster of active teammates (id, full_name, email, department) for any authenticated user, and use it as the roster source in the two pickers. This mirrors the existing `bd_list_visible_users` / `list_all_profiles_for_super_admin` pattern, but scoped to "assignable teammates for tasks and workflows" — no privilege escalation because it only exposes fields already visible in the org directory (name, email, department, active flag), not sensitive HR fields.

### Steps

1. **Migration** — add `public.list_assignable_users()`:
   - `SECURITY DEFINER`, `SET search_path = public`, `STABLE`.
   - Returns `id, full_name, email, department` from `public.profiles` where `is_active = true AND is_placeholder = false`, ordered by `full_name`.
   - `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated`.
   - Requires `auth.uid() IS NOT NULL` (raise `insufficient_privilege` otherwise).

2. **`src/routes/_authenticated/tasks.tsx`** — in `NewTaskDialog`, replace the `people-lite-all` query's `supabase.from("profiles").select(...)` with `supabase.rpc("list_assignable_users")`. Keep the client-side `assigneeFilter` search as is.

3. **`src/routes/_authenticated/workflows.tsx`** — in `TemplateEditor`'s `useEffect`, replace the `supabase.from("profiles").select("id, full_name, email")` call feeding `people` with `supabase.rpc("list_assignable_users")`. Default assignee and default reviewer dropdowns then show everyone.

### Out of scope

- No change to who can *view* or *edit* tasks (that stays governed by existing task RLS / `can_view_task`).
- No change to Edit Task dialog's roster (parent-provided; user didn't flag it — can follow up if needed).
- No change to BD screens, which intentionally use the narrower `bd_list_visible_users` scope.
- Preview only, no publish step.
