# Plan — Punch-out picker + Task Detail simplification

## 1) Punch-out task picker (`src/routes/_authenticated/punch.tsx`)

### Current structure
- `TaskCombobox` renders each option as `[PROJECT_CODE (mono)] Task title  STATUS`, and the trigger button also leads with the project code. Project code visually dominates.
- Below the picker, an entry row has a **separate `Project` Select field** (auto-disabled when a task is picked but still visible), plus Hours, comment textarea, and an "at risk" checkbox.
- There is no view of prior comments on the selected task — the user cannot see what they already reported.

### What changes
- **Combobox item:** two-line layout. Line 1 = task title (primary, normal weight). Line 2 = small muted `project.name` (subtitle). Drop the mono project code from the primary line. Keep status pill on the right.
- **Combobox trigger (selected state):** same two-line treatment — title on top, tiny muted project subtitle underneath. Placeholder unchanged.
- **Row layout:** when a task is selected, hide the separate Project Select entirely (project is implied). Keep the Project Select only when no task is picked (allowNone / no assigned tasks fallback). Hours stays; row grid collapses to just Hours when task is chosen.
- **Inline prior comments:** when `r.taskId` is set, fetch the last ~10 comments for that task and render a compact read-only list directly under the "What did you work on?" textarea:
  - Query: `supabase.from("task_comments").select("id, body, created_at, author:profiles!author_id(full_name)").eq("task_id", r.taskId).order("created_at", { ascending: false }).limit(10)`
  - Wrapped in a small `useQuery` hook keyed by `["punch-task-comments", taskId]`, `staleTime: 30_000`.
  - Empty state: single muted line "No comments on this task yet."
  - Each item: author name · relative time on one line, body (whitespace-pre-wrap, clamped to ~3 lines) below. Contained in a max-height scroll box (~180px) so a long history doesn't blow up the dialog.

## 2) Task Detail sheet (`src/components/tasks/task-detail-sheet.tsx`)

### Current structure (lines 466–802)
Inside the "Activity" section there is one `bg-muted/20` box that mixes six sub-widgets:
1. **Add checklist item** input + checklist list with checkboxes + delete
2. Attachments (upload + grid)
3. **References** (label input + URL input + Add) rendered as pill list with remove
4. **Dependencies** — search input + result dropdown + list with badges/remove
5. Watch toggle + watcher names
6. Below the box: unified timeline that mixes comments, **checklist items**, **dependencies**, watcher-started events, and activity log; then the comment composer.

### What changes
**(a) References — collapse to one simple field**
- Remove the two-field `Label` + `URL` composer. Replace with a single `Input` (URL only) + `Add` button.
- Enter or click Add appends `{ label: "", url }` (label kept empty; UI uses the hostname or the URL itself as display text — no separate label needed).
- List display simplifies to a small stacked list of links (`<a>` with hostname, external-link icon, and a trash button). Drop the pill styling.
- Server call unchanged (`updateTaskAssetLinks` still takes `{label,url}[]`), so no backend change.

**(b) Comments — strip checklist / dependency UI from composer and timeline**
- **Composer area (the `bg-muted/20` box):**
  - Remove the "Add checklist item" input and the checklist list rendering (lines ~471–515).
  - Remove the "Add dependency" search input, results dropdown, and dependency list (lines ~596–631).
  - Keep: Attachments, References (simplified per (a)), Watch toggle + watcher names.
- **Timeline:**
  - Stop pushing `subtasks` entries (`s-…`) into the timeline (lines ~690–698).
  - Stop pushing `dependencies` entries (`d-…`) into the timeline (lines ~699–707).
  - Comments, watcher-added, and activity-log entries remain. Composer at the bottom stays as-is (plain textarea + Post, with mention parsing intact — that's just text).
- **Progress card:** since checklist can no longer be added from this UI, the "Auto-computed from checklist" hint becomes rare/unreachable through this sheet. Behavior is unchanged for tasks that already have subtasks from elsewhere — leaving it defensive; only removing the add/toggle UI here.
- **Imports/state cleanup:** remove `ListChecks`, `GitBranch`, `Checkbox` (if unused elsewhere in the file after removal), `addSubtask`/`toggleSubtask`/`deleteSubtask`/`addDependency`/`removeDependency` server-fn imports and their `useServerFn` wrappers, plus `newSub`, `subAddBusy`, `depQuery`, `depOptions` state. Verify with tsgo.

### Not touched
- Server functions and DB schema — `task_subtasks`, `task_dependencies`, `updateTaskAssetLinks` remain; we're only removing UI. Existing subtasks/deps on old tasks stay in the DB and can be re-exposed later if needed.
- Kanban/board, EditTaskDialog, MarkDoneDialog, workflow panel — unchanged.
- The three publish-pending threads — untouched.

## Verification
- `bunx tsgo --noEmit` clean.
- Manual: open a task with existing subtasks/deps → confirm they no longer clutter the sheet; comments still post; references add/remove via single field; punch-out picker shows task-first with project subtitle and prior comments appear when a task with history is selected.

Confirm and I'll implement.
