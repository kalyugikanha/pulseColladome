## Problem

On **Attendance → Team timesheet**, admins see only entries stored in `attendance_logs.tasks`. Hours the team logs from a Kanban task (which write to `task_activity`) never appear — so most modern per-task hours (both logged and approved) are invisible on the team view.

For reference: **My Timesheet** already merges both sources (`attendance_logs.tasks` + `task_activity`). Team timesheet was never updated to do the same.

A second, smaller gap: the "Task hours awaiting your approval" panel only lights up when the viewer has direct reports. An admin/PM without direct reports sees nothing to approve, even though they're the fallback approver.

## Fix (frontend-only, single file)

Edit `src/routes/_authenticated/timesheet.tsx`:

1. Add a second query alongside `logs` that fetches `task_activity` rows for the visible users for the selected day:
   - Filter: `actor_id in (visibleUserIds)`, `completion_date = dateIso` (fallback to `created_at::date` when `completion_date` is null, same as My Timesheet), `hours is not null`, `approval_status != 'rejected'`.
   - Select the same shape My Timesheet uses (task + project join, hours, approved_hours, approval_status, note).
   - Respect `hasScope` gate the same way `logs` does.

2. In the `empRows` builder, per employee merge two sources into `tasks`:
   - Existing `attendance_logs.tasks` (unchanged).
   - Synthetic task rows derived from that user's `task_activity` records: `project_code` from `task.project.code`, `project_name` from project or task title, `hours`, `approved_hours` (when `approval_status` is `approved`/`auto`), `comments` from note/title.
   - Recompute `total` and `approvedTotal` from the merged list. Keep the existing `approved` flag driven by `attendance_logs.approved_at` (unchanged) so day-approval UI stays the same.

3. Mark synthetic rows read-only in `EmployeeBlock` (add `source: 'log' | 'activity'` on the Task shape locally). For activity rows: disable inline edit/delete and hide the row-level trash button — approval of task_activity already happens in the "Task hours awaiting your approval" panel below. This mirrors My Timesheet's "via task" affordance.

4. Widen the pending-approvals query for admins/PMs: when `me.isAdmin || me.canManageProjects`, drop the `directReportIds` gate and instead filter `actor_id in (visibleUserIds)` (or unscoped when `isUnscoped`). Managers still see only their reports (unchanged).

5. CSV export: include the merged rows so the exported file matches the on-screen totals.

No schema changes. No RLS changes. No changes to My Timesheet, task_activity write paths, or approval flows.

## Out of scope

- Changing the day-only view to month/range (separate UX ask).
- Editing task_activity hours from the team timesheet (they already have an approval UI in the same page).
