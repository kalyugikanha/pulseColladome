## Why departments aren't showing in Current grants
Every row in `role_grants` currently has `department = NULL` — the bulk provisioner writes it but hasn't been (re-)run since the column was added, and older grants pre-date the form field. The badge renders only when set, so the list looks empty. Fix = backfill from the canonical roster + from existing `profiles.department`, then keep future writes flowing (already wired).

## Plan

### 1. Backfill departments on `role_grants`
One-shot data update:
- For every email in the hardcoded `TEAM_ROSTER` (`src/lib/admin-users.functions.ts`), copy `department` into `role_grants.department` where it's null.
- For any other grant whose matching `profiles.email` has a non-null `department`, copy that value across.
- Verify on `/access` → Current grants list now shows department badges.

### 2. Reusable "Department Head" concept
Data model (single migration):
- New enum value `department_head` on `app_role` (piggybacks on the existing `user_roles` table + `has_role()` function — no new tables).
- New table `public.department_heads (department text primary key, user_id uuid references auth.users on delete cascade, created_at, updated_at)` with GRANTs, RLS, and update trigger. This is the "who leads which department" mapping (one head per department, generalizable to any department).
- RLS: `authenticated` can `SELECT`; only super admins / admins can `INSERT/UPDATE/DELETE`.
- Security-definer helper `public.is_department_head_of(_user_id uuid, _department text) returns boolean` for policy reuse.
- Security-definer helper `public.user_department(_user_id uuid) returns text` reading `profiles.department` (used inside policies so we don't recurse on `profiles`).

Grant Kanishka the role in the same migration:
- Insert `('Marketing', <kanishka_user_id>)` into `department_heads`.
- Insert `department_head` role into `user_roles` for her.
- Also ensure her `profiles.department = 'Marketing'` and `role_grants.department = 'Marketing'`.

### 3. Permissions — "Full department manager" for the head's department
Extend RLS policies (additive — existing admin/self policies stay):

- **`profiles`**: dept head may `SELECT` and `UPDATE` rows where `user_department(profiles.id) = <their dept>`. Sensitive columns (salary-adjacent) stay off-limits — salary lives on `salaries`, which we do NOT expand.
- **`leave_requests`**: dept head may `SELECT` all requests for their dept and `UPDATE` `status` / `admin_note` (approve/reject). Existing `handle_leave_status_change` trigger already updates balances.
- **`attendance_logs` + `punch_sessions`**: dept head may `SELECT` and `UPDATE` (edit hours) rows belonging to users in their dept.
- **`tasks`**: dept head may `SELECT / INSERT / UPDATE / DELETE` tasks whose `assignee_id` is in their dept (assign & manage tasks).
- **`projects`**: dept head may `SELECT` all projects and `UPDATE` those where any member is in their dept — keeps project ownership with PMs/admins but lets her adjust team-scope details. (Confirm during implementation whether `projects.members` is an array column or via a join table; adjust predicate accordingly.)
- **`salaries` / `employee_bank_details` / `vendor_payments` / `role_grants` / `super_admins`**: NO change — dept head cannot see or edit salary or access controls.

### 4. Client-side surfacing
Extend `useCurrentUser` (`src/hooks/use-current-user.ts`):
- Fetch `department_heads` row where `user_id = auth uid` → expose `headOfDepartments: string[]` and `isDepartmentHead: boolean` on `CurrentUser`.
- Preserve the same fields for the impersonated view when a super admin uses view-as.

Route gating (`src/routes/_authenticated/route.tsx`): treat `isDepartmentHead` as a manager-tier permission for showing:
- `/leave` admin tab, `/hours-editor`, `/tasks` assign UI, `/timesheet`, `/project-burn` — same items admins see, but scoped by the RLS above.

Scope filtering in admin views (no new logic, just seed the filter):
- On `/hours-editor`, `/timesheet`, `/project-burn`, `/finances`, when the current user is a dept head (and not admin), default the Department multi-select to their `headOfDepartments` and disable "Select all" (they can still narrow further).
- `/leave` admin tab: filter list to their department(s).
- `/access`: dept heads do NOT get access here (super admin / hr_admin only, unchanged).

### 5. UI badges
- `/access` → Current grants: show `Marketing Head` badge when the user has both `department_head` role and a matching `department_heads` row.
- `/team` roster: small "Head" chip next to the head's name in their department.

### Out of scope (per your note — you'll define more later)
- No admin CRUD screen for assigning department heads yet (Kanishka seeded via migration; we'll add a "Manage department heads" card on `/access` in a follow-up once you list what else she'll be doing).
- No changes to salary visibility, vendor payments, or access-control tables.
- No changes to `/dashboard` personal widgets.

## Verification
1. `/access` → Current grants shows department badges for the whole roster, incl. `Marketing` for Kanishka + a `Marketing Head` badge.
2. Sign in as Kanishka → sidebar shows manager pages; `/hours-editor` and `/timesheet` open pre-filtered to Marketing; opening a non-Marketing employee returns empty by RLS.
3. Kanishka approves a Marketing leave request → status flips, balance decrements via existing trigger. Approving a non-Marketing request fails (RLS).
4. Kanishka cannot see `/finances` salary values (kept admin-only) and cannot open `/access`.
5. Admin/super admin behavior unchanged.
