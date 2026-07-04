## Employee Onboarding module + HR Admin role

Voice note (translated from Hindi): "Add an Employee Onboarding module. When HR adds a new employee, all details from the form (dates, etc.) are captured and mentioned in one place. Assign `shraddha@colladome.com` an HR Admin role — their job is to Create a New User; when someone is onboarded, all their information (email ID, date of birth, whatever is captured) is stored."

### 1. New `hr_admin` role
- Extend `app_role` enum with `hr_admin`.
- HR Admin can:
  - Create new team members (auth user + profile).
  - Read & update all profiles (name, department, DOB, joined_on, phone).
  - Read/manage `role_grants` (assign non-super roles).
- HR Admin cannot: manage salaries, finance data, or elevate someone to admin / super_admin (super_admin only).
- Add `private.is_hr_admin(uuid)` helper (SECURITY DEFINER, same private-schema pattern we just adopted, EXECUTE to authenticated).
- Add matching RLS policies on `profiles` and `role_grants` so HR Admin queries succeed.

### 2. Grant Shraddha the role
- Upsert `role_grants` row for `shraddha@colladome.com` with `role='hr_admin'` so:
  - If she already has a profile → also insert a `user_roles` row for her.
  - If she signs up later → the existing `handle_new_user()` trigger picks it up.

### 3. New Onboarding page `/onboarding`
Route under `_authenticated/onboarding.tsx`, visible in top-bar for super_admin + hr_admin.

**Add Employee form** (single card, grouped sections):
- Personal: Full name, Email, Phone, Date of birth
- Work: Department, Role (employee / project_manager; super_admin toggle only for super_admin), Joined on, Employment type (full-time / intern / contract)
- Compensation (super_admin only): Monthly salary, Currency
- Notes (optional)

**Submit flow** (new server fn `onboardEmployee`, gated by `is_super_admin` OR `is_hr_admin`):
1. Upsert into `role_grants` (email, role, default_monthly_salary if provided by super_admin).
2. Call `supabaseAdmin.auth.admin.createUser` with `email` + temp password `Test@123`, `email_confirm: true`, `user_metadata.full_name`.
3. After profile row exists (via `handle_new_user` trigger), update profile with `department`, `date_of_birth`, `joined_on`, `phone`, `employment_type`, `notes`.
4. Mark `must_change_password = true` so the user is forced to reset on first login.
5. Return `{ ok, email, temporary_password }` so HR can copy/share it.

**Recently onboarded list** (right side / below form):
- Table of last 20 onboarded team members (name, email, role, department, joined_on, created_at).
- Search box.
- Row click → drawer to edit their profile fields (name, department, DOB, joined_on, phone, employment_type, notes, role).

### 4. Schema additions to `profiles`
Add nullable columns: `phone text`, `employment_type text` (check: full_time / intern / contract / consultant), `notes text`. `date_of_birth` and `joined_on` already exist.

### 5. Navigation & access
- Top-bar: add "Onboarding" link visible when `me.isSuperAdmin || me.isHrAdmin`.
- `use-current-user` hook: expose `isHrAdmin` derived from `user_roles`.
- Onboarding route guard: redirect to `/dashboard` if neither.

### 6. Calendar integration
- Values entered here (DOB, joined_on, department) flow straight into the existing Team Calendar (birthdays, anniversaries, department colors) — no extra wiring needed beyond the profile update.

### Out of scope
- Sending welcome email (temp password shown in-app for HR to share).
- Document uploads (IDs, offer letter). Can follow in a later iteration.
- Bulk CSV onboarding.

### Technical checklist
- Migration: enum value, `private.is_hr_admin`, RLS policies on `profiles` / `role_grants`, three new columns, `role_grants` upsert for Shraddha.
- Server fn: `onboardEmployee` (super_admin OR hr_admin) + `listOnboardedEmployees` + `updateEmployeeProfile`.
- Client: `src/routes/_authenticated/onboarding.tsx`, top-bar entry, `useCurrentUser` update.
