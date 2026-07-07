## 1. Stop assignees from rating themselves

**Problem:** When Sweksha closes her own task, the Close dialog shows a 1–5 star input and `closeTask` writes a `task_ratings` row with `rater_id = ratee_id = Sweksha`. This happens whenever the task has no reviewer OR the reviewer is the assignee — which is exactly the situation after Kanishka reassigns her own task to Sweksha without updating the reviewer.

**Rule going forward:** A rating can only be recorded by a *different* person acting as reviewer. Self-close never produces a rating.

**Changes**
- `src/components/tasks/workflow-task-panel.tsx` — in both close-dialog blocks, tighten `canRate` to `task.reviewer_id && task.reviewer_id === actingUserId && task.assignee_id !== actingUserId`. When the acting user is the assignee, hide the star row entirely and stop passing `rating` in the `closeTask` payload.
- `src/lib/workflows.functions.ts` — in `closeTask`, remove the two `await maybeRecordRating(task.assignee_id)` calls (auto-approve branch and no-review branch). Keep `maybeRecordRating` unused or delete it. Ratings continue to be written only by `reviewTask` when a distinct reviewer approves.
- Reviewer auto-resolution stays: if no reviewer is set, we still fall back to the stage's default reviewer / workflow starter as today, but never write a rating on that self-approve path.

## 2. Log assignment / reassignment in task history

**Problem:** `edit-task-dialog.tsx` updates `tasks.assignee_id` directly via `supabase.from("tasks").update(...)`. No `task_activity` row is written, so Sweksha's history view shows nothing about the task being created for Kanishka and later handed to her.

**Changes**
- New server function `updateTaskFields` in `src/lib/tasks-workflow.functions.ts` (co-located with existing `logActivity` helper). Accepts the same patch shape edit-task-dialog uses, loads the current row first, applies the update, and — when `assignee_id` changed — inserts a `task_activity` row with `kind: 'assignee_changed'`, `from_value` = old assignee id, `to_value` = new assignee id. Also notifies the new assignee.
- `src/components/tasks/edit-task-dialog.tsx` — replace the direct `supabase.from("tasks").update(...)` call with `useServerFn(updateTaskFields)` so every edit goes through the logging path.
- `src/lib/workflows.functions.ts` — inside `spawnNextStage`, when a new stage task inherits a different assignee than the previous stage, also insert an `assignee_changed` activity row on the new task so the workflow handoff shows up in history.
- Task detail view already reads `task_activity` and renders rows generically; add a friendly label for `assignee_changed` (`"Reassigned from X to Y"`) in whichever component formats activity entries (locate via `rg "kind" src/components/tasks | rg activity`), resolving names from the profiles the detail loader already fetches (extend the activity select if needed to join actor + from/to profiles, or fetch profile names on the fly).

## 3. Verify

- Sign in as Sweksha, close a task where reviewer = Sweksha (or null): confirm no star input appears and no `task_ratings` row is created.
- Sign in as Kanishka, review-approve a task assigned to Sweksha with a rating: confirm rating persists and shows in Sweksha's monthly average.
- Edit a task and change the assignee: reopen the task and confirm the history shows "Reassigned from … to …" with actor + timestamp.
