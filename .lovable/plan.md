## Goal

1. Super admin can create a new team account (like `akash@colladome.in`) that starts with password **`Test@123`** and is forced to change it before using the app.
2. Akash (already granted `project_manager` in `role_grants`) — and any other project manager — gets access to the **Hours Editor** to view and edit anyone's logged hours, but stays locked out of Finances / Project Burn.

## What already works, no change needed

- `must_change_password=true` on a profile → `AuthenticatedLayout` already redirects them to `/change-password` and `/change-password` already sets it back to `false`.
- `handle_new_user` already reads `role_grants` on first sign-in and assigns the role stored there (Akash's row is `project_manager`).
- Hours Editor UI shows only hours (no salary/burn), so it's safe to open to PMs.

## Changes

### 1. Server function: create user with default password (super-admin only)

- New file `src/lib/admin-users.functions.ts` exporting `createTeamUser` (`createServerFn` + `requireSupabaseAuth`).
  - Verify caller is a super admin (`is_super_admin`), else 403.
  - Dynamic-import `supabaseAdmin` and call `supabaseAdmin.auth.admin.createUser({ email, password: "Test@123", email_confirm: true, user_metadata: { full_name } })`.
  - After creation, `UPDATE public.profiles SET must_change_password=true WHERE id=<new id>` (belt-and-braces: `handle_new_user` already sets it for email signups, but forcing it here removes edge cases).
  - Optionally accept `full_name` and `role_grant` fields; if provided, upsert into `role_grants` before creating the auth user so `handle_new_user` picks it up on the trigger. If the user already exists in `role_grants`, keep that row.

### 2. Access page — add "Create account" section (super-admin only)

- On `src/routes/_authenticated/access.tsx`, above "Grant a role", add a **Create account** card:
  - Fields: full name, email, role dropdown (employee / admin / project_manager), super admin toggle, default salary (optional).
  - Button "Create account" → upserts `role_grants` with the chosen role/super-admin/salary, then calls `createTeamUser`.
  - On success: toast "Account created — temporary password `Test@123`. They'll change it on first sign-in."
- Also expose `project_manager` as an option in the existing "Grant a role" dropdown (currently only `employee` / `admin`).

### 3. Open Hours Editor to project managers

- `src/routes/_authenticated/hours-editor.tsx`: replace the `isSuperAdmin` gate with `me.canManageProjects` (which is true for admins + project managers + super admins — already computed in `use-current-user.ts`).
- `src/routes/_authenticated/route.tsx`: move the "Hours Editor" sidebar entry out of the super-admin-only block and into the `isAdmin`-gated block, gated on `canManageProjects` (needs one new prop on `AppSidebar`).
- Finances / Project Burn / Vendors / Access & Roles stay as they are (super-admin / finance-admin only).

### 4. RLS on `attendance_logs`

- Add a policy so project managers can `SELECT/INSERT/UPDATE/DELETE` any attendance row: `public.can_manage_projects(auth.uid())`.
- Keep the existing super-admin and self-owner policies.

## Files touched

- New migration: add the PM policy on `attendance_logs`; nothing else schema-wise.
- New: `src/lib/admin-users.functions.ts`.
- Edited: `src/routes/_authenticated/access.tsx`, `hours-editor.tsx`, `route.tsx`.
- No changes to Finances, Project Burn, Vendors, or Change Password page.

## Notes for the user

- `Test@123` will be shown to whoever creates the account so they can share it out-of-band with the new hire; we don't email it.
- Existing accounts (Arti, Sandeep, Jagjeet, Shubham) already have their own passwords — this flow only affects newly created accounts.