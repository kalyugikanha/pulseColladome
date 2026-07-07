## Problem

When Kanishka reviews her team's logged hours, there are two review surfaces and one of them is missing the partial-approve control:

1. **Day-per-employee table (attendance_logs)** — opening "Full editor" already shows an editable Approved column per row (day-editor-sheet.tsx). This works.
2. **"Task hours awaiting your approval" card (task_activity)** on the Timesheet page — only shows Approve / Reject buttons. There is no way to approve fewer hours than the person logged. This is the gap.

Even when approved, the approved amount is not carried through: `decidePending` writes only `approval_status/approved_by/approved_at`, and the individual's dashboards (`my-timesheet`, `performance`, `project-burn`) read the raw `hours` field for approved rows, so a partial approval would not "reflect the actual approved hours" on the employee side.

## Changes

### 1. Manager review UI — allow approving fewer hours
`src/routes/_authenticated/timesheet.tsx` (the "Task hours awaiting your approval" table):
- Replace the read-only Hours cell with two columns: **Logged** (read-only) and **Approve** (editable number input, default = logged, min 0, step 0.25). Local state per row keyed by activity id.
- Update `decidePending(id, decide, reason?, approvedHours?)` to also write `approved_hours: decide === "approved" ? approvedHours ?? loggedHours : null` into `task_activity`. Reject continues to null it out.
- Show a small "Approved X of Y" hint under the input while the approver edits, matching the reduced-approval language already used elsewhere.

### 2. Employee-facing reflection of the actual approved amount
- `src/routes/_authenticated/my-timesheet.tsx` — the `activityRows` query already selects `approval_status`; add `approved_hours` to the select and change the row build so `approvedHours = approved ? Number(a.approved_hours ?? a.hours) : null` (mirrors how attendance_logs rows already handle partial approval). Existing "Approved (reduced)" badge then lights up automatically.
- `src/routes/_authenticated/performance.tsx` — add `approved_hours` to the select. `totalHours` (which drives the monthly "hours" figure the employee sees) should count `approved_hours ?? hours` for approved/auto rows and `hours` for pending rows, so a partial approval reduces the shown total.
- `src/routes/_authenticated/project-burn.tsx` — add `approved_hours` to the select and sum `approved_hours ?? hours` so a reduced approval reduces project burn.

### 3. No schema changes
`task_activity.approved_hours` already exists from the earlier migration; nothing new is needed on the database side.

## Verify

- As Kanishka, open Timesheet → "Task hours awaiting your approval" for a Sweksha entry of 4h. Change the Approve field to 2, click Approve. Row disappears, `task_activity.approved_hours = 2, approval_status = 'approved'`.
- As Sweksha, open My Timesheet: the row shows Logged 4.0 / Approved 2.0 with the "Approved (reduced)" badge.
- As Sweksha, open My Performance for that month: monthly hours total counts 2, not 4.
- Project Burn for that project counts 2 hours for that entry.
- Rejecting still nulls approved_hours and hides the row from employee approved totals.
