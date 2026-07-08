# Auto-route reviews to reporting managers + require hours on submit

## What changes

### 1. Reviewer = assignee's reporting manager (all managers, all reports)

- **DB trigger** `tasks_auto_reviewer` (BEFORE INSERT OR UPDATE OF assignee_id) on `public.tasks`:
  - When `assignee_id` is set/changed and the assignee has a `reporting_manager_id`, set `reviewer_id = <that manager>` (overwrites any prior value).
  - If the assignee has no reporting manager, fall back to existing behavior (leave `reviewer_id` alone; `setTaskStatus` still defaults to `created_by` on submit).
  - Skips when the assignee IS their own manager (edge case) or when assignee_id is null.
- **One-time backfill** in the same migration: for every task where `status <> 'done'`, set `reviewer_id = profiles.reporting_manager_id` of the assignee whenever that manager exists — overwrites current reviewer_id per your choice.
- New tasks created via `create_task_full` / duplication / recurring generation automatically pick up the trigger, so no app-code change needed for routing.

### 2. Require hours before "Submit for Review"

- **New column** `tasks.hours_worked numeric` (nullable; only meaningful once submitted).
- **Server fn** `setTaskStatus` (`src/lib/tasks-workflow.functions.ts`):
  - When transitioning to `done` and reviewer routing kicks in (status becomes `review`), require `hours_worked > 0` in the payload; otherwise throw `"Log hours before submitting for review."`.
  - Save `hours_worked` on the task and log a `hours_logged` entry into `task_activity` (kind + numeric).
- **UI** (`src/components/tasks/task-detail-sheet.tsx`):
  - When the assignee changes status to `done` and a reviewer exists, open a small "Log hours" dialog (number input, min 0.25, step 0.25, required note optional) instead of firing the mutation immediately.
  - Submit calls `setTaskStatus({ taskId, status: "done", hours_worked })`.
  - Show the logged hours in the task header once set (e.g. "Logged: 3.5h").
- Reviewer-side approval flow unchanged.

### 3. Keeping the manager in the loop

- Existing `notify(..., "review_requested", ...)` already pings the reviewer — no change; the routing change means Shubham (and every other manager) automatically receives review pings for their reports.

## Out of scope

- No change to how timesheet/daily allocations work — hours logged on the task are independent of the daily timesheet approval flow (we can wire them together later if you want a single source of truth).
- No change to reviewer for already-`done` tasks (historical integrity).
- No new "reassign reviewer" UI — the manager can still manually override on a task if needed.

## Technical notes

- New enum value for `task_activity.kind`: `hours_logged` (if the column is an enum; otherwise plain text).
- Migration order: add column → create trigger → backfill reviewer_id.
- Trigger is `SECURITY DEFINER` with `search_path=public` and reads `public.profiles.reporting_manager_id`.
- Server-fn validator extended to accept optional `hours_worked: number`; guarded so non-review status changes ignore it.
