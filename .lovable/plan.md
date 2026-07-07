Big refactor. I've grouped it so we can review the data model first, then the UI shell, then the flows.

## A. Remove from Admin
Delete these routes + files, and drop their nav entries in `src/routes/_authenticated/route.tsx`:
- `/tasks-overview` (`tasks-overview.tsx`) — Task Overview
- `/task-templates` (`task-templates.tsx`) — Task Templates
- `/performance` (`performance.tsx`) — Team Performance
- `/analytics` (`analytics.tsx`) — Output Analytics

Also delete server helpers only used by them (`src/lib/analytics.functions.ts`, `src/lib/performance.functions.ts`, `src/lib/task-stage-templates.ts`) and the DB table `public.task_templates` + `task_template_task_types` (data is throwaway per user). Keep Attendance, Employee Directory, Project Burn, Timesheet, Taxonomy.

## B. Data model — new tables & task columns

Migration (single file):

```
workflow_templates (id, name, description, department, is_active, created_by, created_at, updated_at)
workflow_template_stages (
  id, template_id → workflow_templates,
  position int,           -- 1-based order
  name text,              -- "Storyboarding"
  requires_review bool,   -- adds a review gate before Done
  default_assignee_id uuid null,  -- optional default per stage
  default_due_offset_days int null,
  required_fields jsonb,  -- [{key:"screenshot",kind:"attachment",label:"Post screenshot"},{key:"published_url",kind:"url",label:"Where published"}]
  branch_options jsonb,   -- [{key:"video",label:"Send to Video Editing"},{key:"design",label:"Send to Designing"}]
                          -- next_stage_position is resolved by matching branch key → child stage
  branch_target_map jsonb -- {"video": 2, "design": 3}  → maps branch key to next stage position
)
workflow_instances (id, template_id, started_by, started_at, root_task_id, current_stage_position)
task_review_comments (id, task_id, author_id, body, kind ENUM('comment','request_changes','approve'), created_at)
```

Alter `public.tasks` to add:
- `workflow_template_id uuid null`
- `workflow_instance_id uuid null`
- `stage_index int null`               (1-based; the position of the stage this task represents)
- `stage_snapshot jsonb null`          (frozen copy of that stage's config so template edits don't rewrite history)
- `required_fields_values jsonb`       (values collected when the assignee closed the task)

Drop from `tasks`: `marketing_stage`, `current_stage_id`, `is_multi_stage` and their supporting tables `task_stages`, `task_stage_events` (replaced by the workflow model). Also drop `task_templates`, `task_template_task_types`, `role_task_type_presets`, `user_task_presets` (only Task Overview / Templates used them).

Full GRANTs + RLS in the same migration:
- Templates: read for any authenticated; write for admin/super_admin only.
- Instances: read for any authenticated; write via server functions.
- Review comments: read for anyone who can read the task; insert scoped to the task's assignee (comment), reviewer (approve/request_changes), or task manager.

## C. Workflow engine (server functions in `src/lib/workflows.functions.ts`)

- `listTemplates()` / `getTemplate(id)` — for pickers and admin.
- `saveTemplate({id?, name, department, stages: [...]})` — admin CRUD; validates that every `branch_target_map` key exists in `branch_options` and points to an existing later stage.
- `startWorkflow({templateId, projectId, title, dueDate?, assigneeId})` — creates a `workflow_instances` row + first task (stage 1), assignee defaults to caller if template stage has none, sets `stage_snapshot`.
- `closeTask({taskId, actualHours?, branchKey?, nextAssigneeId?, requiredFieldValues})`:
  1. Validate all `required_fields` are supplied.
  2. If stage `requires_review` → set task `status='review'`, insert a "handed for review" activity, notify the workflow's reviewer (default = instance `started_by`). No next task yet.
  3. Else mark `status='done'`, then:
     - If stage has `branch_options` and `branchKey` chosen → find `branch_target_map[branchKey]` → spawn next task at that stage_index.
     - Else if there's a next stage (position+1) → spawn it.
     - Else close the chain (nothing to spawn).
- `reviewTask({taskId, action:'approve'|'request_changes'|'comment', body?, nextAssigneeId?, branchKey?})`:
  - `comment` inserts a `task_review_comments` row only.
  - `request_changes` inserts a comment, sets task back to `in_progress`, notifies assignee. Repeatable.
  - `approve` inserts an approve comment, marks task `done`, then spawns the next stage (same branching rule as above).
- `logTaskTime({taskId, hours, note?, date?})` — writes to `task_activity` with `approval_status='auto'` (self-logged against your own task).

Any user can assign to any user. Server functions accept an `assigneeId` with no role gate. RLS on `tasks` widens to `INSERT` for any authenticated user; existing task-visibility policies stay.

## D. Kanban unification — same 4 columns everywhere

Delete `marketing-kanban.tsx` and `bd.tsx` (kanban parts). Add one shared component `src/components/board/board-kanban.tsx` with columns `To Do | In Progress | Review | Done`, driven by `tasks.status` only. Card renders:
- title, priority, assignee avatar
- if `workflow_instance_id`: small breadcrumb badge "Template name — Stage X of Y"
- click → opens `TaskDetailSheet`

Mount at:
- `/tasks` (My Tasks) — filter `assignee_id = me.id`, plus the existing "Awaiting my review" / "Hours awaiting approval" cards (still relevant for approvals).
- `/board/marketing`, `/board/business-development`, `/board/tech` — filter tasks whose assignee's `profiles.department` matches that vertical. "Project Management" nav group links here.

Move behavior: dragging a card only updates `tasks.status`, except:
- moving into `review` triggers the current stage's close flow if `requires_review` (opens close dialog first — collects `required_fields`, hours, branch if any).
- moving into `done` triggers close flow too.
- Only the task assignee (or admin) can move a card off `todo`/`in_progress` into `review` or `done`. Anyone with view can drag within `todo`/`in_progress`. Reviewer moves out of `review` via the review actions in the detail sheet, not by dragging.

## E. Task Detail Sheet updates (`src/components/tasks/task-detail-sheet.tsx`)
- Header shows workflow breadcrumb if in an instance, with links to sibling tasks in the chain (`workflow_instance_id` group query).
- New "Workflow" panel: shows all stages of the template, marking done/current/pending; branch stages show which branch was picked.
- New "Review" panel: list of `task_review_comments` (timestamped). If viewer is the reviewer for this stage, show textarea + `Request changes` / `Approve` buttons; approve triggers `reviewTask` and (when applicable) branch/assignee picker modal.
- New "Close task" button (assignee only): opens a modal that collects `required_fields`, actual hours, and — if the stage branches — `branchKey` + `nextAssigneeId`.
- **Log time** action lives here only.

## F. My Timesheet — task-only entries
- `day-editor-sheet.tsx`: keep the assignee-only task picker (already done), but hide the "Add row" button unless the user has at least one assigned task. Keep the existing enforcement that every row needs a `task_id`.
- Move the "+ Log time" entry point from the timesheet header onto the task detail sheet. My Timesheet header keeps date-range filters but drops the standalone "Log time" button.
- Timesheet rows keep linking back via `task_id`.

## G. Seed data — "Marketing Content Production" template
Insert as part of the migration (idempotent):
1. Storyboarding — requires_review=false, branch_options=[video, design], branch_target_map={video:2, design:3}
2. Video Editing — requires_review=true
3. Designing — requires_review=true
4. Social Media Posting — requires_review=false, required_fields=[{screenshot, attachment, required}, {published_url, url, required, label:"Where published"}]

New task dialog gains a "Start from workflow" section: pick a template → picks first-stage assignee → the "New task" button calls `startWorkflow` instead of the plain create.

## H. Admin — new `/workflows` route
Simple builder (behind admin/super_admin gate): list templates, create/edit/rename, drag-reorder stages, per-stage form for review flag, required fields, and branch config (with branch → target stage mapping).

## Open questions (call out; I'll assume the noted default if you don't override)
1. **Existing marketing tasks** with `marketing_stage` set — assume: keep the tasks (title/desc/assignee), drop the stage/kanban placement, set `status='todo'` unless already `done`. History rows stay as-is.
2. **Reviewer identity** on a workflow — assume: `workflow_instances.started_by` is the default reviewer for every `requires_review` stage. Not per-stage configurable in v1.
3. **Branch selection UI** — assume: when the assignee closes a branching stage, they pick the branch key AND the next assignee (no default). Admin cannot fix branch assignees at template time.

Reply "go" (or with tweaks) and I'll ship it in one pass.
