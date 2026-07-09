# Stage 2 — Task-primary timesheet views (UI only)

Display + filter change only. No query, schema, or persistence changes. Nothing published.

## src/routes/_authenticated/timesheet.tsx (manager day grid)

**Header row (line ~579-586)**
Replace: Employee | Project | Hours | Notes | Status | (menu)
With: Employee | **Task** | Hours | Notes | Status | (menu)

**Task cell (`EmployeeBlock`, line ~699-709)**
For activity-sourced rows: primary line = task title (from `t.comments` fallback / stored task title), secondary line = `<code>PROJCODE</code> · Project Name` in `text-[10px] text-muted-foreground`. Keep the "via task" badge inline with the title.
For log-sourced rows (legacy, no task): primary line = "—" (or project name as fallback), secondary line = project code/name. Editable project `Select` is removed from this column; project remains derived and read-only. Existing inline hours/comments editing stays.
Note: legacy log rows lose their inline project dropdown; project is still shown, and full editing remains via the "Open full editor" (DayEditorSheet) menu item, which is where Stage 1 already made Task primary.

**Empty-employee row (line ~668)**
`colSpan={3}` stays correct (Task + Hours + Notes merged).

**Quick-add row (line ~735-760)**
Replace project `Select` with a **Task** picker scoped to that employee: query their assigned tasks (via `tasks` where `assignee_id = row.profile.id`, active only) and on pick, derive project code/name from the chosen task. `onAdd` signature extended to carry `taskTitle`/derived `project_code`. Hours input unchanged. Guard: require a task_id before saving (mirrors Stage 1 validation in DayEditorSheet).
"Add project" trigger button relabels to "Add task".

**Filters header (line ~505-507)**
Add a new `MultiSelectFilter` labeled **Task**, options built from tasks visible in the day (unique `task_id`s across `activityRows`, label = task title, sub = project code). New `taskSel: Set<string>` state, applied inside `empRows` alongside `projSel` (activity rows filter by `task_id`; log rows are excluded when a task filter is active since they have no task_id).
Keep existing Projects filter.

**CSV export (line ~446-470)**
Header becomes: `Employee, Email, Department, Task, Project Code, Project, Hours, Notes, Status`.
Per-row Task column: activity rows → task title; log rows → empty string.

## src/routes/_authenticated/my-timesheet.tsx (my view)

**Header row (line ~197-204)**
Reorder to: Date | **Task** | Project | Logged | Approved | Status | (edit)
Task column shows: primary = task title (from `r.comments` for activity source, since it already carries the task title as fallback; blank for legacy log rows). Project cell keeps `code · name` but styled as secondary muted text.

No filter changes on this page (existing project filter stays as-is per your instruction "display/column-order change").

## Out of scope (as requested)

- No changes to Supabase queries, RLS, `attendance_logs.tasks` shape, or `task_activity`.
- No publish.
- No changes to DayEditorSheet (Stage 1 already handled it).

## Verification

- `bunx tsgo --noEmit` after edits.
- Visual check in preview at `/timesheet` and `/my-timesheet`.

Waiting for your go-ahead before touching any file.
