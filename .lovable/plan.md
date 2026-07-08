
## Orphan reviewer audit (item 5) — numbers first

Ran against live DB:

- Active employees with **no reporting_manager_id**: **2**
- Open tasks (todo/in_progress/review) whose assignee has no manager: **5**
- Distinct affected employees among those: **1**
- Tasks currently sitting in **Review** with no manager to approve: **1**
- Super admins available as fallback: **2**

So the "stuck in review" blast radius today is exactly **1 task / 1 employee**, but the risk grows every time a manager-less employee sends work to review. Recommendation (for your approval, not doing it yet): when routing to a reviewer and the assignee has no reporting manager, fall back to the first `super_admins` row. No data migration — just a runtime fallback in the same routing code path.

## Files & tables I plan to touch — additive only

### Frontend (preview-only, no publish)
- `src/components/tasks/task-detail-sheet.tsx` — remove the forced `MarkDoneDialog` gate on To Do → In Progress → Review transitions. Keep the dialog reachable as an *optional* "Log hours" action. Only Review → Done stays reviewer-gated (existing logic).
- `src/components/tasks/mark-done-dialog.tsx` — keep file. Repurpose as optional log-hours; drop "required" validation. No renames.
- `src/routes/_authenticated/punch.tsx` — redesign punch-out dialog:
  - Add prominent **"Skip for now"** button that completes punch-out immediately.
  - Remove the "hours must equal session length" validation.
  - Add per-row **"At risk"** checkbox on each task allocation.
  - Show a gentle banner on punch-in/out: *"You have X.Xh unlogged from <date>"* (self-only).
- `src/components/tasks/workflow-task-panel.tsx` — no functional change; already routes through `closeTask`/`reviewTask`.

### Server functions (additive)
- `src/lib/tasks-workflow.functions.ts` — in the reviewer-resolution block, add super-admin fallback when assignee has no manager and no explicit reviewer. No column changes.
- `src/lib/punch.functions.ts` — accept optional `at_risk` per allocation and write it into the existing `punch_sessions.allocations` JSONB (no schema change). Compute + return the user's unlogged-hours running total.
- `src/lib/workflows.functions.ts` — **confirmation, no edit needed** for stages where `requires_review = true`: `spawnNextStage` already only runs after `reviewTask('approve')` (line 358) or the self-approve shortcut when reviewer == assignee. For stages configured with `requires_review = false`, self-close currently spawns the next stage (line 300). **Question for you before I touch this:** should stages explicitly configured as "no review" also now require manager approval? If yes I'll gate line 300 the same way; if no, this file stays untouched.

### Database (additive migration only, no drops/renames)
One migration adding:
- `public.tasks.at_risk boolean not null default false` (surfaces the at-risk flag to the assignee's reporting manager via existing RLS — managers already see their reports' tasks).
- `public.profiles.unlogged_hours_balance numeric not null default 0` — running per-user shortfall, updated by `punch.functions.ts`. Visible only to the employee (existing profile self-select RLS already covers this).
- No changes to `task_activity`, `punch_sessions`, `attendance_logs`, `leave_*`, `onboarding_*`, or any workflow table. No column removed. No row rewritten.

## Explicitly NOT touched
- Reporting-manager auto-routing logic (kept as-is).
- Task hour-log entries (`task_activity`), attendance sessions (`attendance_logs`, `punch_sessions` schema), reviewer routing tables, onboarding, workflow templates/instances.
- No renames, no drops, no destructive backfills.
- No publish — preview only.

## Two things I need from you before editing
1. **Workflow stages with `requires_review = false`**: gate their next-stage spawn on manager approval too, or leave self-close spawning as today?
2. **Super-admin fallback reviewer**: OK to auto-route review tasks with no manager to the first super admin? (Affects 1 task today.)
