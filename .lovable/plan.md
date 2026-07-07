
## Scope

Four connected changes so hours always trace back to a task and a project:

1. Moving a Marketing Kanban card also writes those hours to the mover's timesheet
2. Nobody can log timesheet hours without picking a task
3. My Tasks gets status filter + actual/approved hours per task
4. Task creation captures an estimated-hours field, shown next to actuals

## 1. Kanban move → timesheet entry

Today, moving a card in `marketing-kanban.tsx` prompts for hours and writes a `task_activity` row with `hours`, but nothing lands in `attendance_logs`. So project-burn and My Timesheet miss those hours.

In `commitMove(...)` inside `src/routes/_authenticated/marketing-kanban.tsx`, after the activity insert, upsert a line into the mover's `attendance_logs` for today:

- Look up the task's `project` (already joined on the card).
- Fetch today's `attendance_logs` row for `me.realId` (create if missing).
- Append `{ project_code, project_name, task_id, hours, comments: "<task title> → <toStage>" }` to the existing `tasks` JSON.
- Recompute `total_hours`.
- Refuse the write (and undo the stage move? No — just warn) if the day is already `approved_at` — surface a toast telling the user to ask their manager to unapprove.

Invalidate `["my-ts-logs"]`, `["ts-logs"]`, `["pb-logs"]` after the write so My Timesheet and Project Burn update immediately.

## 2. Every timesheet hour must be linked to a task

`DayEditorSheet` (used by My Timesheet + Timesheet Approvals) currently accepts `{ project_code, hours, comments }` with no task link.

Changes in `src/components/day-editor-sheet.tsx`:

- Extend the row type to `{ project_code, task_id, task_title, hours, comments }`.
- Add a **Task** column (required) between Project and Hours. Options are loaded from `tasks` filtered by the selected `project_id` and where the user is assignee/reviewer/creator. Changing project resets task.
- Save validation: refuse rows with no `task_id`; toast "Pick a task for every hour you log."
- Persist `task_id` and `task_title` inside each `tasks[]` entry of `attendance_logs` (the JSON column already accepts arbitrary keys — no schema change needed for storage).
- Show a small inline note above the table: "Hours must be tied to a task. Ask your manager to create one if needed."

Same rule applies to the assistant's timesheet apply path (`src/lib/assistant/apply.functions.ts`) — reject entries without a task match.

Grandfathering: existing rows without `task_id` remain readable and editable; they just have to be assigned a task before the row can be re-saved.

## 3. My Tasks — status filter + approved-hours column

In `src/routes/_authenticated/tasks.tsx`:

- Add a filter bar above the grouped list with:
  - **Status** multi-select (todo, in_progress, review, done). Default = all except `done`. A "Show done" chip toggles done back in.
  - **Sort**: due date / recently updated / most hours.
- For each visible task, compute two numbers by querying `attendance_logs` for the current user (or all users if admin viewing others later): sum of `hours` from `tasks[]` entries whose `task_id` matches, split by whether the row is `approved_at IS NOT NULL`.
  - Show as `12.5h logged · 8h approved` under the task title.
  - Show `est 10h` next to it when the task has an estimate (see §4). Colour red if actual > estimate.

Query shape: one aggregated read per page load — `attendance_logs` filtered to `user_id = me.id` for the last 90 days, then group in JS by `task_id` from the JSON. If perf becomes an issue later, we can add a SQL view; not now.

## 4. Estimated hours on tasks

Small schema addition (migration):

- Add `estimated_hours numeric(5,2)` to `public.tasks` (nullable).
- Update `create_task_full(...)` RPC to accept `_estimated_hours numeric default null` and store it.

Client wiring:

- `src/lib/tasks-plus.functions.ts` — add `estimatedHours` to `TaskInput` and pass through to the RPC and to the `updateTaskFull` patch.
- `src/routes/_authenticated/tasks.tsx` **New task** dialog — add "Estimated hours" number input (optional, min 0, step 0.25). Persist in `submit()`.
- `src/components/tasks/edit-task-dialog.tsx` — add the same field so estimates can be corrected later.
- `src/components/tasks/task-detail-sheet.tsx` — show `Estimated · Logged · Approved` trio in the header alongside status.
- Kanban card in `marketing-kanban.tsx` and Projects page task chips — small `est 6h` badge when set.

No estimate = no comparison, just show actuals.

## Technical notes

- Storage of `task_id` inside `attendance_logs.tasks` (JSON) is enough — no new join table needed. Queries stay simple: `select tasks from attendance_logs where user_id = ? and date >= ?`, then filter JSON in JS.
- No RLS changes needed; `attendance_logs` policies already gate by user_id / manager / admin.
- The kanban-move → timesheet write goes through the browser Supabase client as the current user, so RLS applies naturally.
- Estimated-hours column is added with `null` default so all existing tasks remain valid.

## Out of scope for this change

- Retroactively backfilling task_ids on historical timesheet rows.
- Business team's punch-in enforcement — same rule will apply once §2 lands because the DayEditorSheet is shared; the punch page separately uses `allocations` which already supports `task_id`, so no code change is needed there. We'll flip the "task required" validator on for punch in a follow-up once the marketing team has adopted §2.
