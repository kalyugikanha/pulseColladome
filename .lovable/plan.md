## Rename Team → Attendance, add Employee Directory, add reporting managers

Split today's Team page into two: **Attendance** (attendance + leave approvals only, for everyone who currently sees Team) and a new **Employee Directory** (edit users, department, reporting manager — HR/super admins edit, dept heads and reporting managers view their people). Add a `reporting_manager_id` on profiles so managers get a Kanishka-style scoped view of their direct reports across the app.

### 1. DB migration

- Add `profiles.reporting_manager_id uuid null references public.profiles(id) on delete set null`, index on it.
- Create SECURITY DEFINER helper `private.is_reporting_manager_of(_manager uuid, _user uuid)` returning boolean (walks `reporting_manager_id` — direct reports only, no transitive chain for v1).
- Create SECURITY DEFINER helper `private.reports_to(_manager uuid)` returning `setof uuid` for use in scoping queries.
- Add SELECT/UPDATE policies on `profiles`, `attendance_logs`, `leave_requests`, `tasks`, `punch_sessions` for reporting managers on their reports (mirroring existing dept-head policies but keyed on `is_reporting_manager_of`).
- No changes to salary/finance tables — managers stay hours-only, same as dept heads.

### 2. Current-user hook (`src/hooks/use-current-user.ts`)

- Add `isReportingManager: boolean` and `directReportIds: string[]` (fetched via `profiles.select("id").eq("reporting_manager_id", user.id)`).
- Include in the view-as branch.

### 3. Sidebar (`src/routes/_authenticated/route.tsx`)

- Rename the "Team" item to **"Attendance"** for everyone who currently sees it (admin / dept head / reporting manager). Keep same `/team` URL, or rename route to `/attendance` — I'll rename the route file for clarity.
- Add **"Employee Directory"** item at `/directory`, visible to super admins, HR admins, dept heads, and reporting managers.
- Extend the visibility conditions for Project Burn / Hours Editor / Timesheet / Tasks Overview / Task Templates / Taxonomy to include `isReportingManager` (mirrors dept-head treatment).

### 4. Attendance page (`src/routes/_authenticated/attendance.tsx`, renamed from `team.tsx`)

- Keep only two tabs: **Today's attendance** and **Leave approvals**.
- Remove the "Members" tab and the make-admin toggle (moves to Employee Directory).
- Scope: super/HR/admin see all; dept head sees `headOfDepartments`; reporting manager sees `directReportIds`.
- Attendance list already shows punch-in / punch-out / hours per user for today — keep as-is; that satisfies "check for different durations for different users."

### 5. New Employee Directory (`src/routes/_authenticated/directory.tsx`)

- Table of employees with columns: name, email, department, reporting manager, employment type, joined on, role badges.
- Filters: department, reporting manager, role.
- Row actions:
  - **Super admin / HR admin:** edit dialog to update `full_name`, `department` (dropdown from taxonomy), `reporting_manager_id` (searchable select of profiles), `employment_type`, `phone`.
  - **Dept head / reporting manager:** read-only view scoped to their people (dept members or direct reports); no edit affordance.
- Scope logic mirrors Attendance: full org for super/HR/admin, `headOfDepartments` for dept head, `directReportIds` for reporting manager.

### 6. Reporting manager parity with dept head

Wherever code branches on `isDepartmentHead` for scoping (Project Burn, Hours Editor, Timesheet, Tasks Overview, Task Templates, Taxonomy read), treat `isReportingManager` the same way, using `directReportIds` as the profile scope instead of `headOfDepartments`. Cost columns stay hidden for both.

### Verification

- **Shubham (super admin):** sidebar shows Attendance + Employee Directory. Attendance has only today + leave. Directory lists everyone; can edit dept + reporting manager.
- **Kanishka (dept head, Marketing):** Attendance scoped to Marketing; Directory read-only Marketing list.
- **New reporting manager with 3 reports:** Attendance shows only those 3; Directory read-only shows those 3; Project Burn / Hours Editor scoped to those 3, no INR.
- **Regular employee:** no sidebar entry for Attendance or Directory.
