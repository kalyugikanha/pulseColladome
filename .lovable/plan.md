
## What's broken today

1. **Timesheets** — Approvers can only Approve / Unapprove a day as-is. There's no way to approve fewer hours than an employee logged (e.g. someone logs 9h but the reviewer thinks only 7h are billable). Once approved, the `hours` field itself becomes the "official" number, so HR can't see a Logged-vs-Approved gap per person.

2. **Ratings** — When the reviewer is the same person as the assignee (Kanishka's self-close flow), no rating is ever recorded, because both rating entry points block it:
   - `reviewTask` guards with `task.assignee_id !== actingUserId`.
   - `closeTask` (the auto-approve path for reviewer=assignee) has no rating input at all.
   So the "Average rating this month" card on **My Performance** stays empty.

---

## Changes

### A. Approve fewer hours (Timesheets)

**Data**
- Extend each row inside `attendance_logs.tasks` (JSON) with an optional `approved_hours: number`.
  - Absent / null while pending. Defaults to `hours` on approval if reviewer doesn't override.
- Add two rollup columns to `attendance_logs`:
  - `logged_hours numeric` — sum of row `hours`
  - `approved_hours numeric` — sum of row `approved_hours` (only meaningful when `approved_at is not null`)
- Backfill: `logged_hours = total_hours`, `approved_hours = total_hours` where `approved_at is not null`.

**Day editor sheet** (`src/components/day-editor-sheet.tsx`)
- Add an "Approved hrs" column next to "Hours", editable only for `canApprove` users.
- Rewrite `toggleApproval`:
  - On Approve: for any row where reviewer didn't set an override, set `approved_hours = hours`. Recompute row rollups, write `approved_hours`/`logged_hours` back to the row.
  - On Unapprove: clear `approved_hours` on the log record (keep per-row values for audit).
- Save flow keeps `logged_hours` in sync with row `hours`.

**My Timesheet** (`src/routes/_authenticated/my-timesheet.tsx`)
- Show both `Hours` and `Approved` columns. If `approved_hours < hours`, badge reads "Approved (reduced)" with a tooltip showing the delta.
- Header stats: "Logged 42.5 · Approved 40.0".

**Admin Timesheet** (`src/routes/_authenticated/timesheet.tsx`)
- Same two-column display per row.
- Add a per-person summary row (or a small side card): Logged total, Approved total, Gap.

**HR view**
- Add a small "Logged vs Approved (this month)" card on `hr.leave.tsx` OR reuse the existing timesheet page with a month-range picker and a per-person summary table (Logged / Approved / Gap / Approval %). Simpler: put it inside the existing admin timesheet page as a "Month summary" toggle so we don't create a new route.

Task-level `task_activity.hours` (Kanban-logged hours that flow into My Timesheet as "Awaiting approval") gets the same treatment: add `approved_hours` column, and in `workflow-task-panel`'s Approve dialog let the reviewer override the logged number before saving. `approval_status='approved'|'auto'` continues to gate what shows as approved.

### B. Ratings on self-close + counted in monthly avg

**Server** (`src/lib/workflows.functions.ts`)
- `reviewTask.inputValidator` already accepts `rating`. Drop the `task.assignee_id !== actingUserId` guard in the insert — reviewer=assignee is a legitimate rating (Kanishka rating her own work when she's both). Keep the 1–5 bounds check.
- `closeTask`: add optional `rating?: number` to the validator. When the auto-approve branch fires (reviewer missing OR reviewer === actingUserId), insert into `task_ratings` with `ratee_id = assignee_id`, `rater_id = actingUserId`.

**Client**
- `mark-done-dialog.tsx`: add a 1–5 star row (optional) shown only when the current user is the reviewer or no reviewer exists. Pass `rating` through `onConfirm`.
- Wire the caller of `MarkDoneDialog` (task detail sheet) to forward `rating` into `closeTask`.
- Reviewer's Approve dialog (`workflow-task-panel.tsx`) — allow rating even when `assignee === actingUserId` by relaxing the `canRate` guard.

**My Performance** — no code change needed; the query already reads `ratee_id = me`. Once inserts are unblocked, ratings will appear.

---

## Technical notes

- Migration is additive (two nullable columns on `attendance_logs`, one on `task_activity`); no existing reads break.
- All existing filters (`.eq("user_id", ...)`, RLS) unchanged.
- `logged_hours`/`approved_hours` are convenience columns for HR reporting — the JSON row-level values remain authoritative.
- Ratings write path stays server-side (`createServerFn` with `requireSupabaseAuth`).

## Out of scope

- No new HR route or export CSV in this pass — the month-summary lives inline on the existing admin Timesheet page.
- No rating history UI on tasks (just the number continues to feed My Performance).
