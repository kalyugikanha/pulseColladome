## Goal
Provision all 18 team members from your list: create accounts (temp password `Test@123`), assign roles, set monthly salaries, and set departments.

## Role & department mapping

Applying your rule "split role-like values from department, dept stays literal":

| Email | Role | Super admin | Salary (INR) | Department |
|---|---|---|---|---|
| arti@colladome.com | admin | yes | 60000 | Operations |
| shraddha.saxena@colladome.in | hr_admin | no | 15000 | HR |
| sweksha@colladome.in | hr_admin | no | 5000 | HR |
| akash@colladome.in | project_manager | no | 40000 | Project Management |
| kanishka@colladome.in | employee | no | 35000 | Marketing |
| deepak@colladome.in | employee | no | 20000 | Marketing |
| Sandeep@colladome.in | employee | no | 13000 | Marketing |
| anjali@colladome.in | employee | no | 6000 | Marketing |
| hemanth@colladome.in | employee | no | 10000 | Marketing |
| manvi@colladome.in | employee | no | 5000 | Marketing |
| trisha@colladome.in | employee | no | 5000 | Marketing |
| jagjeet@colladome.in | employee | no | 28000 | Business Development |
| chirag@colladome.com | employee | no | 30000 | Business Development |
| juhi@colladome.com | employee | no | 20000 | Business Development |
| neetu@colladome.in | employee | no | 2000 | Business Development |
| sarita@colladome.in | employee | no | 0 | Business Development |
| riyanshi@colladome.in | employee | no | 0 | Business Development |
| arpit@colladome.in | employee | no | 0 | Development |

Notes:
- Arti stays super admin (as she is today); role also set to `admin` so RLS admin checks pass.
- "Super Admin" and "HR Admin" in your sheet were roles, not real departments — I've given them sensible department labels (Operations, HR). If you prefer different labels, tell me and I'll swap them in.
- Full name is taken from your list (proper capitalization, e.g. "Akash Jangid", "Addala Hemanth Sridhar").

## Changes

### 1. Migration
- Add `department text` to `public.role_grants` so the department flows in on first sign-in for anyone not yet provisioned.
- Update `public.handle_new_user()` to also copy `g.department` into `profiles.department` when present.

### 2. Server function — `bulkProvisionTeam` (super-admin only)
New server fn in `src/lib/admin-users.functions.ts`. For each entry in the hardcoded list above:
- Upsert `role_grants` with `email, role, is_super_admin, default_monthly_salary, department`.
- If a `profiles` row already exists for that email:
  - Update `profiles.department` and `profiles.full_name` (only if currently blank/default).
  - Upsert `user_roles` (add `admin`/`hr_admin`/`project_manager` as needed; add `super_admins` row if applicable).
  - Upsert a `salaries` row (`effective_from = CURRENT_DATE`) with the listed monthly salary.
- Else: call `supabase.auth.admin.createUser` with `password: "Test@123"`, `email_confirm: true`. The existing `handle_new_user` trigger then picks up role_grants (role, super-admin, salary, and now department) and creates profile + leave balances.
- Return `{ created: [...], updated: [...], skipped: [...], errors: [...] }`.

Guardrail: only callable by super admin (matches existing `provisionPendingUsers` pattern).

### 3. UI — Access page
On `/access`, add a new card **"Provision team from list"** with:
- A short description of what it does.
- A "Run provisioning" button.
- Result summary after run (counts + expandable lists of created/updated/skipped/errors).

No changes to the existing "Create account" or "Grant a role" cards.

## Out of scope
- Phone, DOB, joined_on, employment_type, notes — not in your sheet; leave as-is.
- No email invites; users sign in with `Test@123` and are forced to change password (existing flow).
- No changes to leave balances beyond what `handle_new_user` already seeds.

## Verification
1. Run migration.
2. Click "Run provisioning" on `/access`.
3. Spot-check: `select email, department from profiles where email in (...)` and `select p.email, s.monthly_salary from profiles p join salaries s on s.user_id = p.id`.
