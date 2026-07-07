## Three fixes

### 1. Default reviewer = the person who assigned/created the task (all tasks)
Today the reviewer default only kicks in when:
- workflow task: stage's `default_reviewer_id` at creation
- non-workflow task: `created_by`, but only lazily when the assignee first marks it Done

Change: at **task creation** always set `reviewer_id = created_by` when it's null and `created_by !== assignee_id`. Apply to every path that creates a task:

- `src/lib/tasks-plus.functions.ts` → `createTaskFull` and `duplicateTask`: after the `create_task_full` RPC, update `reviewer_id = actingUserId` when assignee ≠ actingUserId.
- `src/lib/workflows.functions.ts` → `startWorkflow` (line ~159) and `advanceWorkflow` helper (line ~419): replace `reviewer_id: first.default_reviewer_id ?? null` / `nextStage.default_reviewer_id ?? null` with `reviewer_id = actingUserId (creator) when creator ≠ assignee, else stage default_reviewer_id, else null`. Creator is the workflow starter for stage 1; the actor who closed the previous stage for subsequent stages.
- Notification block that currently only fires for the stage's default reviewer expands to notify whoever ends up as the resolved reviewer (skipping when reviewer == assignee or reviewer == acting user).
- `src/lib/tasks-workflow.functions.ts` `markStatus`: keep the existing "fall back to created_by on mark-done" as a safety net — no-op when reviewer_id is already set at creation.

Rating/review flow is unchanged: whoever ends up as `reviewer_id` still reviews and rates.

### 2. Approved pending hours don't refresh the day card
`decidePending` in `src/routes/_authenticated/timesheet.tsx` (line ~172) invalidates `my-ts-activity`, `my-performance`, `pb-activity` — but **not** the team-timesheet's own `["ts-activity", …]` query that feeds the employee card above. So approving a row updates the DB but the card keeps showing it as unapproved (or missing) until a manual reload.

Fix: after a successful approve/reject, also `qc.invalidateQueries({ queryKey: ["ts-activity"] })` (and `["ts-logs"]` for completeness). The activity row's `approval_status` flips to `approved` with `approved_hours` set, the merged `empRows` recomputes, and the approved hours appear in the card above the same instant.

Note on visibility: the top card is scoped to the selected day via `completion_date`. A pending entry logged for another day will still not appear in *today's* card after approval — that's correct behavior. This fix only addresses the missing refresh for same-day entries.

### 3. Reorder: pending approvals card first, then day's employee card
Currently the layout is: header → employee day card → pending approvals card. Swap them so **"Task hours awaiting your approval"** renders first (above), and the **employee day breakdown** (with totals row) renders below it, unchanged in content.

## Files to change
- `src/lib/tasks-plus.functions.ts`
- `src/lib/workflows.functions.ts`
- `src/routes/_authenticated/timesheet.tsx`

## Out of scope
- Changing the `create_task_full` RPC itself
- Removing the ability to override reviewer via the task detail sheet
- Any change to the review/rating workflow after a task is marked done
- Cross-day visibility of approved task hours (day card stays scoped to the selected date)
