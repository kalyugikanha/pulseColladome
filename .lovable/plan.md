## Fix: Stage-1 default reviewer not populated on task creation

### Root cause
In `src/lib/workflows.functions.ts`, `startWorkflow` creates the first task of a workflow but does not copy the first stage's `default_reviewer_id` onto the task row. `spawnNextStage` already does this for later stages, so reviewers appear from stage 2 onward but never on stage 1. The task card reads `tasks.reviewer_id`, so it renders empty.

### Change
One edit in `src/lib/workflows.functions.ts`, inside the `startWorkflow` handler where the newly created task is patched with workflow metadata (currently sets `workflow_template_id`, `workflow_instance_id`, `stage_index`, `stage_snapshot`):

- Add `reviewer_id: first.default_reviewer_id ?? null` to that update.
- If `first.default_reviewer_id` exists and is not the assignee, also insert a `reviewer_assigned` notification for them (mirrors the assignee notification already sent below).

No schema changes, no changes to `closeTask` / `spawnNextStage` / RLS. Existing tasks that were created before this fix stay as-is (they'll pick the reviewer up via the existing fallback when moved to review); only newly started workflows get the reviewer stamped up front.

### Verification
Start a new task under "Static Creation Workflow" → the task card should show Kanishka as reviewer immediately, before any status change.
