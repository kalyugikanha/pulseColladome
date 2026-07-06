# Multi-Stage Sequential Workflow for Tasks

Kanishka's request: one task ID flows through multiple owner-specific stages (Scriptwriting → Graphic → Review → PDF → Review → Client share → Client feedback → Posting → Live link). Currently a task has a single assignee, single reviewer, and flat status — this plan adds a first-class "stages" concept while keeping the existing task shell intact.

## Data model (new migration)

New table `public.task_stages`:
- `task_id` (FK tasks, cascade)
- `position` (int, 1-based order)
- `name` (text, e.g. "Scriptwriting", "Graphic preparation", "Client share")
- `kind` (enum: `work` | `internal_review` | `client_review`) — controls approve/reject routing
- `owner_id` (FK profiles) — who does this stage
- `reviewer_id` (FK profiles, nullable) — for review stages
- `status` (enum: `pending` | `active` | `in_review` | `changes_requested` | `done` | `skipped`)
- `started_at`, `completed_at`, `decision_note` (text)
- unique `(task_id, position)`

New table `public.task_stage_events` (audit trail per stage):
- `stage_id`, `actor_id`, `kind` (`started` | `submitted` | `approved` | `rejected` | `reassigned` | `commented`), `from_status`, `to_status`, `note`, `created_at`

Add to `public.tasks`:
- `current_stage_id uuid` (nullable, FK task_stages)
- `is_multi_stage boolean default false`

RLS/GRANTs following project pattern:
- Stage read: reuse `private.can_view_task(task_id)` + include stage `owner_id` / `reviewer_id` as viewers.
- Stage write: owner can submit their own stage; reviewer can approve/reject a review stage; task creator / admin / project manager / department head can edit stage list and reassign.
- All wired via `private.*` security-definer helpers (same style as existing task RLS).

## Backend server functions (`src/lib/tasks-stages.functions.ts`)

All use `requireSupabaseAuth` and route through an RPC for atomicity:

- `listTaskStages({ taskId })` — ordered stages + owner/reviewer profiles + latest event.
- `setTaskStages({ taskId, stages: [{ name, kind, owner_id, reviewer_id? }] })` — replaces the stage list; only allowed while task hasn't started or by managers. Sets `is_multi_stage=true`, `current_stage_id` = first stage, first stage `active`.
- `submitStage({ stageId, note? })` — owner marks their stage complete.
  - If next stage is a review stage → current stage becomes `in_review`, no advance yet.
  - Else → current `done`, advance `current_stage_id` to next stage (`active`), notify next owner.
- `decideStage({ stageId, decision: "approve" | "reject", note? })` — reviewer only.
  - approve: current `done` → advance to next stage; notify next owner. If no next → task `status='done'`.
  - reject: current `changes_requested`; jump back to the previous non-review stage, set it `active`, notify its owner with `note` copied into task_stage_events + a task comment tagged "Rejected at <stage>".
- `reassignStage({ stageId, ownerId })` — manager/creator only; logs event, notifies new owner.
- `insertStageTemplate({ taskId, templateKey })` — optional helper for the OS0012 preset template (Scriptwriting → … → Live link).

The single mutating RPC `public.advance_task_stage(_stage_id, _action, _note)` performs the state transition + event insert + task.current_stage_id update + notification in one transaction to avoid partial states (same pattern used for `create_task_full`).

## UI

### 1. Task detail sheet (`src/components/tasks/task-detail-sheet.tsx`)
New "Workflow" section shown when `is_multi_stage`:
- Vertical stepper listing stages in order with owner avatar, kind badge (Work / Internal review / Client review), status pill.
- Current stage highlighted; past stages collapsed with decision note.
- Buttons contextual to viewer:
  - Owner of active stage → "Mark stage complete" (+ optional note).
  - Reviewer of in_review stage → "Approve" / "Send back with comments" (comment required for reject; auto-added to comments thread and shown on the previous owner's task card).
  - Manager/creator → "Edit stages" (opens editor), "Reassign owner" per stage.
- Full stage history rendered inline (who did what, when, feedback).

### 2. Stage editor dialog
- Add / remove / reorder (drag) rows.
- Each row: name (free text or preset), kind, owner (profile picker), reviewer (only when kind is review).
- "Load template: OS0012 content pipeline" button seeds Kanishka's 9-step flow.
- Save calls `setTaskStages`.

### 3. Task creation (`src/routes/_authenticated/tasks.tsx`)
- New "Multi-stage workflow" toggle in the create dialog. When on:
  - Assignee picker is replaced by the stage editor (first stage owner defaults to the current assignee).
  - After task RPC succeeds, immediately call `setTaskStages`.
- When off, existing single-assignee flow is unchanged.

### 4. Task list / My Tasks
- Show a small "Stage: <name> · <owner>" chip on cards where `is_multi_stage`.
- "My Tasks" filter includes any task whose *current active stage owner* is me, so a rejected item automatically reappears in the previous owner's list (satisfies the "goes back to Anjali with comments" requirement).
- "Awaiting my review" already covers reviewers via the current stage's reviewer_id — extend the existing `listAwaitingMyReview` fn to include stage reviews.

### 5. Notifications
Reuse `public.notifications`; new `kind` values: `stage_assigned`, `stage_review_requested`, `stage_approved`, `stage_rejected`. Body includes stage name and note.

## Error handling
Map RPC errors (`42501` → "You don't have permission for this stage action", `P0001` custom → surface message verbatim) via the existing `taskCreateError` helper, extended to `stageActionError`.

## Verification
1. As admin, create task "OS0012" with multi-stage toggle → load OS0012 template → save.
2. As scriptwriter → submit stage 1 → task moves to Anjali.
3. As Anjali → submit → task enters review, appears in Kanishka's "Awaiting my review".
4. Kanishka rejects with note → task returns to Anjali's My Tasks with the note visible on the card + in stage history.
5. Kanishka approves → task advances to Sandhya (PDF).
6. Continue through to Live link; final approval sets task `status='done'` and records full audit trail.

## Technical notes
- Keep `tasks.assignee_id` in sync with the current active stage's `owner_id` (trigger on `task_stages` status change) so all existing views ("My Tasks", assignee filters, RLS) keep working without rewrites.
- Existing single-stage tasks stay untouched (`is_multi_stage=false`, no rows in `task_stages`).
- Presets stored as a constant in `src/lib/task-stage-templates.ts`; can be moved into a DB table later if HR wants to manage them in-app.
