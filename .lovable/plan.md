## Fix marketing-kanban done-flow + status/stage duplication

Three problems to solve:

1. Moving a card to **Posted** silently logs the mover's hours. It should **prompt for actual hours** and **require the task creator's approval** before those hours count.
2. Any marketing teammate can move any card — you want that to stay, but you also want assignees to move their own cards. Already works today (drag is gated on `isMarketingMember`, not ownership) — no change needed there.
3. `tasks.status` (todo / in_progress / review / done) and `tasks.marketing_stage` (Script Writing … Posted) duplicate each other on My Tasks and other views, and drift out of sync. Need a single source of truth for marketing tasks.

### 1. "Mark done" prompt with creator approval

**DB migration** — add per-log approval state to `task_activity`:
- `approval_status text not null default 'auto'` — values: `auto` (no approval needed, e.g. intermediate stage move), `pending`, `approved`, `rejected`.
- `approved_by uuid null references profiles(id)`, `approved_at timestamptz null`, `rejected_reason text null`.
- `attendance_log_id uuid null` — link to the timesheet row so we can hide unapproved hours from project-burn totals until approval.

**Kanban move behavior** (`marketing-kanban.tsx > commitMove`):
- When `toStage === "posted"`, open a new **"Mark done"** dialog first (instead of the generic ReassignDialog). Fields: **Actual hours** (required, prefilled with any estimate), **note** (optional), **assignee stays the same** (no reassignment on Posted).
- On submit: write the `task_activity` row with `kind='task_completed'`, `hours=actual`, `approval_status='pending'`. **Do NOT** append to `attendance_logs` yet. Set `tasks.status='review'` (not `done`) and keep `marketing_stage='posted'` — task is "awaiting hour approval". Notify the creator (`created_by`).
- For all other stage moves keep today's behavior (`approval_status='auto'`, immediate timesheet entry, immediate burn).

**Creator approval surface**:
- New section on `/tasks` (My Tasks) called **"Hours awaiting your approval"** — lists `task_activity` rows where `task.created_by = me` AND `approval_status='pending'`. Each row shows task title, assignee, estimated vs actual hours, note, and Approve / Reject buttons.
- On **Approve**: set `approval_status='approved'`, `approved_by=me`, `approved_at=now()`. Insert the entry into the assignee's `attendance_logs` for the completion date (same shape as today's auto-log) and store `attendance_log_id`. Flip `tasks.status='done'`.
- On **Reject**: prompt for `rejected_reason`, set `approval_status='rejected'`, notify assignee, move card back to `posting` stage so they can adjust.
- Add the same "Approve hours" action inside `task-detail-sheet.tsx` for context.

**Project-burn honesty**: `mkt-burn` query now filters `approval_status <> 'rejected'`, and shows approved vs pending separately in the badge (e.g. `4h · 1h pending`).

### 2. Assignee moves — no change

Already permitted. Explicitly document in the header subtitle: "Anyone on Marketing can move any card." No code change.

### 3. Kill the status/stage duplication for marketing tasks

Marketing tasks (`marketing_stage IS NOT NULL`) will treat `marketing_stage` as the single source of truth. `tasks.status` becomes a derived/coarse rollup used only outside marketing views.

Concretely:
- **My Tasks (`tasks.tsx`)**: when a row has `marketing_stage`, render the **stage** label (Script Writing, Design, Review, Posting, Posted, or "Awaiting hour approval" when posted+pending) instead of the status pill. The existing status filter (todo/in_progress/review/done) is replaced for marketing rows with a stage filter that maps: `todo→script_writing+script_wip`, `in_progress→design`, `review→review+posting+posted-with-pending-hours`, `done→posted-approved`. Non-marketing rows keep the current status filter.
- **Kanban → status sync** (`commitMove`): stop trying to translate stage to status column-by-column. Set `status='done'` only after hours are approved; set `status='review'` for `posted` while pending; set `status='in_progress'` for every other stage. This becomes a one-liner rather than the current 4-way ternary.
- **Task detail sheet**: for marketing tasks, hide the raw "Status" dropdown and show the stage (read-only) with a note "Change stage from the Marketing Kanban."

### Out of scope

- No changes to non-marketing task workflow.
- No backfill of historical `task_activity` rows — existing entries default to `approval_status='auto'`.
- Business team punch-in / other departments untouched.

### Files changed

- `supabase/migrations/…sql` (new)
- `src/routes/_authenticated/marketing-kanban.tsx` (new MarkDoneDialog, updated commitMove, updated burn query)
- `src/routes/_authenticated/tasks.tsx` (approval queue + stage-aware pill/filter)
- `src/components/tasks/task-detail-sheet.tsx` (approve action + stage read-only for marketing)