## Why Kanishka can't see team tasks / timesheets

Kanishka's role is correctly set — `department_heads` row for Marketing exists, and RLS policies already grant department heads read access to `tasks`, `attendance_logs`, `punch_sessions`, and `leave_requests` for anyone in their department. The sidebar shows Team, Hours Editor, Timesheet, Task Overview, and Task Templates to her.

The problem is **page-level gates that check only admin / project-manager and ignore department heads**. When she clicks the link, the page redirects her away before it queries data.

### Fix (frontend gates only, no DB changes)

1. `src/routes/_authenticated/timesheet.tsx` — change both the redirect guard and `canView` from `isAdmin || canManageProjects` to `isAdmin || canManageProjects || isDepartmentHead`. When a dept head views it, scope the `attendance_logs` query to users whose `profiles.department` is in `me.headOfDepartments` (RLS enforces this anyway; the filter avoids empty rows).
2. `src/routes/_authenticated/hours-editor.tsx` — same: allow `isDepartmentHead`, and filter the `attendance_logs` fetch by department.
3. `src/routes/_authenticated/team.tsx` — allow `isDepartmentHead` to view; scope the profile list to her department(s); keep the "Make admin" action admin-only.
4. `src/routes/_authenticated/tasks-overview.tsx` — already allows dept heads; no change needed.
5. Taxonomy: `/admin/taxonomy` (master list edit) stays super-admin only. The taxonomy dropdown inside task creation already works for everyone via `listTaxonomy()`; no change.

### Verification

Sign in as Kanishka, open Team / Hours Editor / Timesheet / Task Overview — each page loads and shows only Marketing employees / their tasks / their attendance.
