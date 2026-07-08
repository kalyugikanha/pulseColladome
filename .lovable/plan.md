## Fix: Duplicate task must carry all fields (workflow, post date, asset links, etc.)

**Problem:** `duplicateTask` in `src/lib/tasks-plus.functions.ts` calls the `create_task_full` RPC, which only accepts a subset of columns. Workflow linkage, scheduled post date, asset links, and several other fields are dropped, so duplicating a workflow task creates a plain task that's disconnected from the workflow.

**Change (single file: `src/lib/tasks-plus.functions.ts`, `duplicateTask` handler):**

1. Expand the source `select` to also read: `client_brand, scheduled_post_date, workflow_instance_id, workflow_template_id, stage_index, stage_snapshot, required_fields_values, review_state, reviewer_id, requester_id, origin_department, is_recurring_template, recurrence_freq, recurrence_days, recurrence_parent_id`.
2. Pass the source's `asset_links` (not `[]`) into `create_task_full` so links are preserved.
3. After the RPC returns the new task id, run a single `supabase.from("tasks").update({...}).eq("id", newId)` that copies over the fields `create_task_full` does not accept:
   - `client_brand`
   - `scheduled_post_date`
   - `workflow_instance_id`
   - `workflow_template_id`
   - `stage_index`
   - `stage_snapshot`
   - `required_fields_values`
   - `review_state` (only if source has a non-default value)
   - `origin_department`
   - `requester_id` (keep original requester)
   - Recurrence fields (`is_recurring_template`, `recurrence_freq`, `recurrence_days`) so duplicating a recurring template creates another template rather than a plain one. Do **not** copy `recurrence_parent_id` — the copy is a new template/task, not another occurrence.
4. Preserve the existing behavior that sets `reviewer_id` to the acting user when assignee differs; only apply that fallback when the source has no `reviewer_id`. If the source already has a `reviewer_id`, copy it as-is.
5. Preserve the existing impersonation `created_by` override.

No schema changes, no UI changes, no changes to other server functions. RLS unaffected — the update runs as the acting user on a row they just created.