## Goal
Add both soft-delete (deactivate) and hard-delete (permanently remove) actions for super admins in the Employee Directory. HR admins keep soft-delete only.

## Backend changes (single migration)

1. **`profiles` table** — add:
   - `is_active boolean not null default true`
   - `deactivated_at timestamptz`
   - `deactivated_by uuid references auth.users`

2. **RLS** — update the "profiles are readable" policies so deactivated users still show in the directory for admins/managers, but stay hidden from ordinary user pickers (dropdowns already scoped by policy). Add:
   - Super admin + HR admin can `UPDATE is_active/deactivated_*` on any profile.
   - Only super admin can call the hard-delete server fn.

3. **Server function `deleteUser`** (`src/lib/directory.functions.ts`, `requireSupabaseAuth` + super-admin check via `has_role`):
   - Loads `supabaseAdmin` inside the handler.
   - Calls `supabaseAdmin.auth.admin.deleteUser(id)` — cascades to `profiles`, `user_roles`, `super_admins`, `leave_balances`, etc. via existing FK `on delete cascade`. Any table missing cascade gets it in the same migration.
   - Returns `{ ok: true }`.

4. **Soft-delete** stays a plain `profiles` update (RLS-gated) — no server fn needed.

## Frontend changes (`src/routes/_authenticated/directory.tsx`)

- Add `is_active` to the `Profile` type and `select()`.
- Show an "Inactive" badge on deactivated rows; dim them.
- Add filter toggle: **Active / Inactive / All** (default Active).
- In the edit dialog footer, add:
  - **Deactivate** (HR + super admin) — sets `is_active=false`, records `deactivated_at/by`. If already inactive, show **Reactivate** instead.
  - **Delete permanently** (super admin only) — red button, confirm dialog "Type the email to confirm", calls `deleteUser` server fn, then invalidates the query.
- Non-super-admin viewers (dept heads/reporting managers) see neither button.

## Technical notes
- Existing FKs to `auth.users` on profiles/user_roles/etc. mostly already `on delete cascade`; migration will `ALTER` any that don't.
- `handle_leave_status_change` and other triggers untouched.
- `useCurrentUser` already exposes `isSuperAdmin` — no changes there.
