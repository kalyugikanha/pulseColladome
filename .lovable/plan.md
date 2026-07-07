In `spawnNextStage` (src/lib/workflows.functions.ts), when the new stage task is created, also set `reviewer_id` on the new task from `nextStage.default_reviewer_id` (if non-null). Currently only `default_assignee_id` is applied; `default_reviewer_id` is ignored on stage advancement, so downstream stages never pre-populate their reviewer from the template.

Add `reviewer_id: nextStage.default_reviewer_id ?? null` to the `.update({...})` call that stamps `workflow_template_id / workflow_instance_id / stage_index / stage_snapshot` on the newly created task.

No other change.