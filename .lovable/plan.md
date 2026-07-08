## Problem

Two task dialogs currently look different:

- **New task** dialog (`NewTaskDialog` in `src/routes/_authenticated/tasks.tsx`) — center‑screen popup. Missing: estimated hours, scheduled post date, asset links. (Project + Project ID line and due date are already there.)
- **Edit task** dialog (`src/components/tasks/edit-task-dialog.tsx`) — side/edit popup used from the list and from duplicated tasks. Already has all fields.

Every task popup should expose the same core fields: project (+ project ID line), assignee, priority, due date, scheduled post date, estimated hours, asset links.

## Changes

### 1. `src/routes/_authenticated/tasks.tsx` — `NewTaskDialog`

Add three new fields with the same styling as the edit dialog:

- **Estimated hours** — number input, `min={0}` `step={0.25}`, optional. Sent to `createTaskFull` via the already‑supported `estimatedHours` field.
- **Scheduled post date** — date input placed next to Due date in a 2‑col grid (matches edit dialog). Optional. Hidden / cleared for recurring tasks (the note about "due date ignored for recurring" already applies).
- **Asset links** — repeatable label + URL rows with "+ Add link" and remove buttons, identical to the edit dialog. Sent via the already‑supported `assetLinks` field on `createTaskFull`.

Because the `create_task_full` RPC does not accept `scheduled_post_date`, after `createFn` returns the new task id, call `updateTaskFields` with `{ scheduled_post_date: postDate || null }` when a post date was entered. Skip this call when the task is recurring (post date not meaningful on the template).

Also reset the three new fields in the existing post‑submit reset block.

Validation: keep existing rules; estimated hours must be a finite number ≥ 0 when provided (mirrors edit dialog).

### 2. No changes to the Edit dialog

`EditTaskDialog` already renders all target fields (project + code, due date, scheduled post date, estimated hours, asset links, assignee, priority). Duplicated tasks go through this same dialog, so once (1) ships both surfaces match.

## Verification

- Open "New task" from the tasks page — confirm the popup now shows Estimated hours, Scheduled post date, and Asset links, and layout matches the Edit dialog.
- Create a task with all three new fields set → task appears with correct estimated hours, post date, and asset links.
- Duplicate a task → click Edit → confirm the same set of fields is present (unchanged behavior).
- Create a recurring task → post date input is not submitted (skipped along with due date).
