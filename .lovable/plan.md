## Goal
Add a dedicated **Approved task hours** panel on the team timesheet, mirroring the "Task hours awaiting your approval" panel but for entries that have already been approved. Right now approved rows only fold into the employee day-breakdown card, and the user wants a standalone panel with project / hours / notes / approver / date.

## Where
`src/routes/_authenticated/timesheet.tsx`, rendered directly below the pending approvals card and above the day-breakdown card. Same visibility rule as the pending card (`pendingEnabled` — managers see their direct reports; admins/PMs/super admins see the visible scope).

## Data
New query `["ts-approved-task-hours", …]` against `task_activity`:
- Select: `id, task_id, actor_id, hours, approved_hours, note, completion_date, created_at, approved_at, approved_by, kind, task:tasks(id, title, project(code, name)), actor:profiles!task_activity_actor_id_fkey(id, full_name, email), approver:profiles!task_activity_approved_by_fkey(id, full_name, email)`
- Filters: `approval_status in ('approved','auto')`, `hours not null`, `completion_date` in the currently-selected day (same date window used by `activityRows`).
- Scope: same `pendingActorIds` logic used by the pending query (managers → direct reports; admins → visible scope).
- Order by `approved_at desc nulls last, created_at desc`.

Invalidate this key wherever `["ts-activity"]` is already invalidated (inside `decidePending` and any other approve/reject spots) so newly-approved rows appear immediately.

## UI
Card titled "Approved task hours" with a count badge. Table columns:
- Employee
- Task / Project (title with project code · name subtext)
- Date (completion date)
- Approved hrs (bold; show logged in muted subtext if different)
- Note
- Approved by / when (approver name + relative time)

Empty state: "No approved task hours for this day."

## Out of scope
- No change to the employee day-breakdown card (approved hours continue to merge into it as today).
- No change to approval mutation logic or reviewer defaulting.
- No cross-day view — panel stays scoped to the selected date, matching the rest of the page.
