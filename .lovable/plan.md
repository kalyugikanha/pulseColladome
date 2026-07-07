## Goal
Approved task hours should appear inside the existing **day-breakdown card** on Team Timesheet using the same visibility rules as the Pending panel. Remove the separate "Approved task hours" panel added previously — it's redundant.

## Why the just-approved row isn't visible today
- Kanishka's approved rows have `completion_date = 2026-07-07`, but the selected day is **8 July 2026**. Selecting 7 July shows them in the day-breakdown table (activity rows are already merged).
- Additionally, a non-admin manager viewing team-timesheet without any dept/user scope selected wouldn't see direct-report activity, because the `ts-profiles` + `ts-activity` queries only scope by dept/user filters — unlike the Pending panel which falls back to `directReportIds`.

## Changes (frontend only, `src/routes/_authenticated/timesheet.tsx`)

1. **Remove the "Approved task hours" panel** (approx. lines ~540–620) and its `ts-approved-task-hours` query + `refetchApproved` call.

2. **Align day-breakdown scope with Pending panel permissions:**
   - Compute `mergedVisibleIds` = union of `visibleUserIds` (dept/user scope) and `pendingActorIds` (direct reports for managers, all for admins).
   - `ts-profiles`: when no scope selected but user is a manager, fetch profiles for their direct reports so those employees render as rows.
   - `ts-activity`: filter by `mergedVisibleIds` when set, so approved/pending activity for direct reports loads even without an explicit dept/user filter.
   - Leave existing `logs` query as-is (attendance logs remain scoped to profiles list — same behavior).

3. **Invalidations in `decidePending`:** drop the `ts-approved-task-hours` invalidation; keep `ts-activity`, `ts-logs`, and the personal keys so the day-breakdown card refreshes when Approve is clicked.

## Result
- Approving a task's hours immediately shows a new row in the day-breakdown card for that employee under the corresponding `completion_date`, with Project, Approved hrs, Notes, and Approved status — matching the existing "activity" row rendering.
- Managers see direct-report approvals without needing to select a dept/user filter.
- No separate approved-hours panel; single source of truth.
