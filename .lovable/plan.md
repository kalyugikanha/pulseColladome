Three fixes across the tasks list, My Timesheet, and the day editor. All UI/logic; no schema changes.

## 1. My Tasks list — marking a marketing task "Done" must open the MarkDone dialog

**File:** `src/routes/_authenticated/tasks.tsx`

Right now the row's status `<Select>` calls `updateStatus(id, "done")`, which just flips `tasks.status`. For marketing tasks this bypasses actual‑hours capture and the "who does this go to next?" hand‑off. We'll intercept "done" for marketing tasks.

- Extract the `MarkDoneDialog` from `marketing-kanban.tsx` into a shared component `src/components/tasks/mark-done-dialog.tsx` (props: `task`, `onClose`, `onConfirm({ hours, note, nextAssigneeId? })`). Keep the existing kanban usage; just import from the new location.
- In `tasks.tsx`, when the user picks "Done":
  - If the task has `marketing_stage` set (i.e. it lives on the marketing board), open `MarkDoneDialog` instead of calling `updateStatus`. The dialog collects **actual hours** (required) and an optional handoff assignee (defaults to the task's `created_by` / requester).
  - On confirm, reuse the same write path as the kanban's `commitMove(task, "posted", nextAssigneeId, { hours, note, pendingApproval: true })` — meaning: update `tasks` with `marketing_stage='posted'`, `status='review'`, `assignee_id=nextAssigneeId`; insert `task_activity` with `approval_status='pending'`, `hours`, `completion_date=today`; notify the creator. Extract this into `src/lib/marketing-close.ts` so both the kanban and the list share one implementation.
  - For non‑marketing tasks, keep the current `setTaskStatus` behavior.
- The dialog should show the current assignee and the task creator, defaulting the "hand off to" field to the creator so the reviewer/approver can pick it up.

## 2. Kanban‑logged hours must appear in My Timesheet

**File:** `src/routes/_authenticated/my-timesheet.tsx`

`my-timesheet` reads only `attendance_logs.tasks`. Hours logged through the kanban's MarkDone go to `task_activity.hours` (with `approval_status` in `pending|approved|auto`) and never surface here. `tasks.tsx` already merges both sources for its progress bars — we mirror that.

- Add a second query alongside `my-ts-logs` that pulls from `task_activity` where `actor_id = me.id`, `completion_date` between `startIso` and `endIso` (fallback to `created_at::date` when `completion_date` is null), `approval_status <> 'rejected'`, and `hours is not null`. Join `task:tasks(id, title, project:projects(id, code, name))`.
- Merge those rows into the flattened `rows` array with:
  - `date` = `completion_date` (or activity `created_at` date)
  - `code`/`name` from the joined project
  - `hours` from `task_activity.hours`
  - `comments` from `note`
  - Status badge: `approved` when `approval_status='approved'|'auto'`, otherwise a new **"Awaiting approval"** badge.
- The row's Edit button for these activity rows should open the task detail sheet (read‑only for hours — actual approval happens in the creator's "Hours awaiting your approval" card on `/tasks`). Do not open the day editor for these rows, since they aren't part of `attendance_logs`.
- Update totals so `totalHours` and `uniqueDays` include activity hours.

## 3. My Timesheet must only allow logging against tasks assigned to me

**File:** `src/components/day-editor-sheet.tsx`

Today `userTasks` is queried with `assignee_id.eq OR reviewer_id.eq OR created_by.eq`. That means a user who created a task for someone else can still log time against it from their own timesheet.

- Tighten the query to `assignee_id.eq.${userId}` only (drop `reviewer_id` and `created_by`).
- Also filter out `status='done'` tasks older than ~30 days so the picker stays short.
- Keep the existing "Pick a task for every row" save guard.
- Update the info banner text to: *"You can only log hours against tasks assigned to you. If the task you worked on isn't here, ask your manager to assign it — or use the "Request a task" flow on Punch."*
- Legacy rows already saved with `task_id` that no longer match the filter continue to render via the existing `legacyTaskMissing` branch, so historical data isn't broken.

## Files touched
- `src/routes/_authenticated/tasks.tsx` — intercept "Done" for marketing tasks.
- `src/routes/_authenticated/marketing-kanban.tsx` — swap inline `MarkDoneDialog` for the shared component and call the shared close helper.
- `src/routes/_authenticated/my-timesheet.tsx` — merge `task_activity` hours; add "Awaiting approval" badge.
- `src/components/day-editor-sheet.tsx` — restrict task picker to assignee only; update copy.
- `src/components/tasks/mark-done-dialog.tsx` — new, extracted from kanban.
- `src/lib/marketing-close.ts` — new shared helper for the "close a marketing task" write path.

No migrations, no RLS changes.
