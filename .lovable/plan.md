## HR Admin: Leave Management + Employee Onboarding

Two new HR utilities for Shraddha / Sweksha (role `hr_admin`), reached from the sidebar Admin group.

---

### 1) HR Leave console — `/hr/leave`

New route `src/routes/_authenticated/hr.leave.tsx` (gated: `isHrAdmin || isSuperAdmin`, redirect otherwise).

**Layout — three tabs on one page:**

- **Day view** — date picker (default today). Shows everyone on leave that day, grouped by leave type, with name, department, type, day range, status. Counters at the top: total on leave, approved, pending. Fetched from `leave_requests` intersecting the selected date, joined with `profiles`.
- **Timeline** — month picker. Horizontal timeline: rows = employees who have any leave in the month, columns = days. Coloured blocks per leave type (casual/sick/earned/unpaid), border style = pending vs approved. Hover shows request details. Compact, scroll-x on mobile.
- **Requests** — filterable table (status, type, department, date range). Row actions: **Approve**, **Reject** (with comment). Bulk approve selected.

**Log leave for any employee (HR):**
- "Log leave" button opens a dialog: employee picker (all active employees), type, start/end (past dates allowed), reason, and a **Mark as pre-approved** checkbox (default on for HR).
- Server function `hrLogLeave` inserts a `leave_requests` row. If pre-approved, status = `approved` immediately (existing `handle_leave_status_change` trigger updates `leave_balances.used`).
- HR can also change status of any existing request via the Requests tab (approve/reject with comment).

**RLS migration** (`leave_requests`, `leave_balances`) — new policies scoped to `hr_admin`:
- `leave_requests`: HR SELECT/INSERT/UPDATE all rows (no DELETE for audit).
- `leave_balances`: HR SELECT/UPDATE all rows (so allocations can be adjusted later if needed — not exposed in UI this pass).
- A tiny SQL helper `private.is_hr_admin(uid)` mirroring `private.is_admin`.

---

### 2) HR Onboarding utility — extend `/onboarding`

The existing `/onboarding` page already lets super/HR admins create users. Add a dedicated **"Onboard new employee"** dialog tuned for HR's workflow:

- Fields: **Official email** (must be `@colladome.com` or `@colladome.in`), **Full name**, **Tentative monthly salary** (₹), Department (optional, dropdown from taxonomy).
- Role defaults to `employee` (HR cannot create admins — already enforced server-side).
- On submit calls existing `createTeamUser` (HR path already allows `default_monthly_salary` — see change below) with the tentative salary written to `role_grants.default_monthly_salary` so the `handle_new_user` trigger inserts the salary row on first sign-in.
- Result screen shows email + temporary password `Test@123` for HR to share, with a "Copy" button.

**Server change (`src/lib/admin-users.functions.ts`):**
- In `createTeamUser`, allow HR admins to set `default_monthly_salary` (currently zeroed for non-super). Keep the "HR can't create admin/hr_admin/super" restriction. Existing "HR can create users" is already permitted.
- No change needed to force onboarding: `handle_new_user` already sets `onboarding_required = true` for new profiles, and `route.tsx` already redirects to `/complete-onboarding` when `onboardingRequired && !onboardingCompleted`. The one-time skip for existing team members (previous change) does NOT affect new users, because their `onboarding_required` starts `true`.

---

### 3) Sidebar

Add "HR Leaves" link to the Admin group in `src/routes/_authenticated/route.tsx`, visible when `isSuperAdmin || isHrAdmin`. Existing "Onboarding" link stays.

---

### Technical notes

- All data fetching via `supabase` browser client under new RLS policies — no new server fn needed for read/approve, only for `hrLogLeave` (writes with `status='approved'` need to bypass the `own insert` policy check — HR policy above allows it).
- Timeline uses a lightweight CSS grid, no external chart lib.
- Zod validation on onboarding email domain client- and server-side.
- No schema changes beyond RLS policies + helper function.

### Files touched

- new `src/routes/_authenticated/hr.leave.tsx`
- edit `src/routes/_authenticated/onboarding.tsx` (add HR-tuned dialog)
- edit `src/routes/_authenticated/route.tsx` (sidebar link)
- edit `src/lib/admin-users.functions.ts` (allow HR salary; add `hrLogLeave` fn)
- new migration: `private.is_hr_admin` + HR policies on `leave_requests` / `leave_balances`
