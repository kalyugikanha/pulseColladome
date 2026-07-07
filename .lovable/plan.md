Wire projects and hours end-to-end for Marketing (and extend to BD), then let Finances compute burn from real work — no more free-form allocations.

## 1. Project is required on every marketing task

`src/routes/_authenticated/marketing-kanban.tsx`

- **New Marketing task dialog**: add a required `Project` dropdown above Client/Brand. Options = `projects` where `is_active` is true, ordered by name. `project_id` is saved on insert; "Client/Brand" stays as a free-text tag on top (optional).
- **Request from Marketing (crossover) dialog**: add the same required `Project` dropdown. Requester picks. Saved as `project_id` on insert.
- Existing tasks with no `project_id` keep working; the edit dialog (below) surfaces a "Set project" field so we can backfill them.

## 2. Edit / Delete on every task

New file `src/components/tasks/edit-task-dialog.tsx` — edit form for a single task with fields: title, description, project, assignee, priority, internal deadline, scheduled post date, client/brand, asset links.

`src/components/tasks/task-detail-sheet.tsx`

- Header gets a kebab menu with **Edit** and **Delete**.
- Delete opens `AlertDialog` → on confirm calls `supabase.from("tasks").delete().eq("id", t.id)`; on success closes the sheet and refetches. Related rows (activity, stage_events, comments, etc.) already cascade via FKs.
- Edit opens the new dialog and, on save, does `supabase.from("tasks").update(patch).eq("id", t.id)` then refetches.
- Permission gate for the menu: `isSuperAdmin || isAdmin || isMarketing || t.created_by === me.realId`. Same gate wraps the SQL calls (server-side RLS already limits, this just hides the buttons).

## 3. Punch-in must attach a task (marketing/BD required, others optional this turn)

Extend punch allocations to carry a `task_id`, and drive `project_code` / `project_name` from that task's project.

DB migration (additive, no data loss):
- Add `task_id uuid` inside allocation rows validation — stored inside existing `punch_sessions.allocations` jsonb (no schema change), plus a top-level `punch_sessions.primary_task_id uuid null` for indexed lookups later.
- No table drops; existing sessions untouched.

`src/lib/punch.functions.ts`
- `PunchAllocationInput` gains `taskId: string | null`.
- Validator: if allocation has `taskId`, resolve the task's `project_id`, project code + name, and set them on the saved allocation row. If both `taskId` and `projectId` provided, `taskId` wins.
- Continues to accept legacy `projectId`-only rows (back-compat).

`src/routes/_authenticated/timesheet.tsx` (only the "add allocation" row UI)
- Add a Task picker next to Project. Task list = tasks visible to me (`can_view_task`) that have a `project_id`, filtered by search string; picking a task auto-fills the project.
- For marketing-department and BD-department users, the Task picker is **required** (project-only allocations rejected client-side with a toast). For other departments it stays optional this turn — same UI, no required flag — so they can migrate later.

## 4. Project burn on Finances includes task-logged hours

`src/routes/_authenticated/finances.tsx`

New section beneath the existing "Project burn — {month}" table:

**Task-logged hours — {month}** — read all `task_activity` rows with `hours IS NOT NULL` in the selected month, join to `tasks.project_id`, group by project. Columns: Project | Users | Hours | Log entries. Purely additive display — does not touch the salary-share calculation, so no double-count risk. Marketing kanban stage moves already land here via `task_activity.hours`, so this immediately shows real per-project burn hours as the team logs moves.

## Files touched

- `supabase/migrations/<new>.sql` — add `punch_sessions.primary_task_id uuid null` column
- `src/routes/_authenticated/marketing-kanban.tsx` — project dropdown in both create dialogs
- `src/components/tasks/edit-task-dialog.tsx` — **new**
- `src/components/tasks/task-detail-sheet.tsx` — kebab menu (Edit / Delete)
- `src/lib/punch.functions.ts` — accept `taskId` in allocations, derive project from task
- `src/routes/_authenticated/timesheet.tsx` — Task picker in the add-allocation row; required for Marketing/BD
- `src/routes/_authenticated/finances.tsx` — new "Task-logged hours" per-project table

All changes are additive. Nothing existing is deleted; historical tasks, activity, and punch sessions are preserved verbatim.