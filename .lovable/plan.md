## Grant HR admins full attendance visibility

Currently the attendance page only shows the "everyone" admin view to `admin` / `super_admin`. HR admins (like Shradhdha) fall back to the manager scope and only see their reporting tree.

### Changes

1. **`src/hooks/use-visibility-scope.ts`** — include `isHrAdmin` in the check that returns the org-wide scope, so HR admins get every user id (same as admins).

2. **`src/routes/_authenticated/attendance.tsx`** — add `isHrAdmin` to the `canView` gate and to the condition that renders the "All employees" admin tab/toggle, so HR admins see the same admin UI as admins.

3. **RLS check** — the existing `attendance_logs` admin-read policy already covers HR admins via `private.is_hr_admin(auth.uid())` (verified in the earlier migration). No DB change needed; if the read policy is admin-only, add an HR-admin SELECT policy on `attendance_logs` and `punch_sessions` in a new migration.

### Verification

- Sign in as Shradhdha → `/attendance` shows the admin/all-employees view with every employee row.
- Managers (Kanishka, Akash, Juhi) still see only their reporting tree — unchanged.
