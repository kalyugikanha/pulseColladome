# Marketing Ops Upgrade — Full Plan

Builds Kanishka's five requested areas on top of the existing tasks module. All changes respect current RLS/role model (admin, super_admin, HR admin, reporting manager, department head, employee).

## 1. Task Assignment & Review Workflow

**Schema (migration)**
- `tasks` add columns: `reviewer_id uuid null`, `review_state text` (`none|pending_review|approved|changes_requested`), `completion_percent int default 0`.
- Extend task status enum with `review` (assignee-done, awaiting reviewer).
- New `task_activity` table: `id, task_id, actor_id, kind` (`created|status_changed|review_submitted|comment_added|assignee_changed|reviewer_changed|percent_changed|subtask_toggled`), `from_value`, `to_value`, `note`, `created_at`. RLS: readable by anyone who can read the parent task.

**Behavior**
- "New task" dialog adds single **Reviewer** picker (same scope rules as Assignee).
- When assignee sets status → `done` AND a reviewer exists → status auto-flips to `review`, `review_state='pending_review'`, activity logged, reviewer notified in-app.
- Reviewer sees "Awaiting my review" section on Tasks page with **Approve / Request changes / Reject** actions + optional note.
  - Approve → status `done`, `review_state='approved'`.
  - Request changes → status `in_progress`, `review_state='changes_requested'`, bounces to assignee.
  - Reject → status `todo`, `review_state='changes_requested'`.
- Task detail sheet shows full history timeline from `task_activity`.

## 2. Comments & Collaboration

**Schema**
- `task_comments`: `id, task_id, author_id, body text, parent_id (self-fk for resolvable threads), resolved_at, resolved_by, created_at, updated_at`.
- `task_comment_attachments`: `id, comment_id, label, url, kind` (`file|link`), plus storage bucket `task-attachments` (private) for uploaded files.
- `task_mentions`: `id, comment_id, task_id, mentioned_user_id, read_at`.

**Behavior**
- Task detail sheet gains a Jira-style comment thread: rich text-ish textarea, `@mention` autocomplete over `profiles`, attach files (upload to bucket) or paste links.
- Mentioned users get an in-app notification badge (reuse existing top-bar) + row in `task_mentions`.
- Each top-level thread can be **Resolved** (collapsed) or reopened. Resolved threads stay in history.
- RLS: comments readable/writable by anyone with task visibility (assignee, reviewer, watchers, creator, admins).

## 3. Progress Tracking

**Schema**
- `tasks.completion_percent` (added above).
- `task_subtasks`: `id, task_id, title, done bool, position int, created_at`.
- `task_dependencies`: `id, task_id, depends_on_task_id` (unique pair, no self, cycle guard via trigger).
- `task_watchers`: `id, task_id, user_id` (unique).

**Behavior**
- Task detail: editable checklist. When subtasks exist, completion% is computed (done/total × 100) and the manual slider is disabled.
- Task list rows show a compact `Progress` bar (existing `ui/progress`).
- Dependency picker in task detail: cannot move a blocked task out of `todo` until all deps are `done`; blocked reason shown as a tooltip on the status select.
- Watchers list on task detail with "Watch"/"Unwatch" button; watchers receive the same in-app notifications as assignee/reviewer on status/comment events.

## 4. Weekly Performance & Feedback

**Schema**
- `weekly_scores`: `id, employee_id, manager_id, week_start date` (Monday), `score int check 0..10`, `feedback text`, `created_at`, `updated_at`, unique(employee_id, week_start).
- RLS: SELECT allowed if `auth.uid() = employee_id` OR `auth.uid() = manager_id` OR `has_role('admin')` OR `has_role('hr_admin')` OR super_admin. INSERT/UPDATE only by manager of the employee (via `profiles.reporting_manager_id`) or admins/HR/super admin.

**UI**
- New page `/_authenticated/performance` for managers: table of direct reports, current-week score input + feedback, "History" drawer with sparkline of prior weeks.
- Employee view on `/dashboard`: private "My weekly score" card, shows current week + line chart of history. Not visible to peers.
- Super Admin / HR Admin can browse all employees.

## 5. Trend Analytics Dashboard

**Approach**: derive counts from completed tasks (`status='done'` with `review_state in (null,'approved')`) joined to `task_task_types` (existing) and `taxonomy_task_types`. No new user-entered logs.

**Page** `/_authenticated/analytics/output`
- Filter: month picker (defaults to current month; past months browsable).
- Table: rows = employees (scoped: everyone for admins/HR/super admin; direct reports for managers; self for employees), columns = task type names (posts, scripts, videos, articles, …) + total.
- Chart: bar chart per employee showing month-over-month totals for the last 6 months.
- "Resets monthly" is expressed by the month filter — historical months remain queryable, current month accumulates.

## Frontend surface changes

- `src/routes/_authenticated/tasks.tsx`: add Reviewer field, "Awaiting my review" section, progress bar in rows, quick % on card.
- New `src/components/tasks/task-detail-sheet.tsx`: tabs for **Details / Checklist / Comments / History / Dependencies / Watchers**. Row click opens sheet.
- New `src/lib/tasks-workflow.functions.ts`: `submitForReview`, `reviewDecision`, `addComment`, `resolveComment`, `toggleSubtask`, `setPercent`, `addDependency`, `toggleWatcher`, `logActivity` (internal).
- New `src/lib/performance.functions.ts`: `upsertWeeklyScore`, `listMyScores`, `listTeamScores`.
- New `src/lib/analytics.functions.ts`: `outputByEmployee({ month })`, `outputTrend({ months })`.
- Sidebar/top-bar: add **Performance** (managers, HR, admins) and **Analytics** (all, scoped).

## Notifications

- Minimal in-app only: reuse existing assistant/top-bar area with a lightweight `notifications` table (`user_id, kind, task_id?, comment_id?, body, read_at, created_at`). Written by triggers/server functions on: assignment change, review requested, review decided, mention, watched-task status change. No email in this phase.

## Ordering of migrations (single migration file)

1. Extend `tasks` (columns + status enum value).
2. Create `task_activity`, `task_comments`, `task_comment_attachments`, `task_mentions`, `task_subtasks`, `task_dependencies`, `task_watchers`, `weekly_scores`, `notifications`.
3. GRANTs for `authenticated` and `service_role` on every new public table.
4. Enable RLS + policies (reads: task-visibility helper `public.can_view_task(uuid)` as security-definer; writes: role-scoped as described).
5. Storage bucket `task-attachments` (private) with per-user path prefix policy.
6. Triggers: activity logging on task changes, dependency cycle guard, subtask → percent recompute.

## Out of scope (call out explicitly)

- Email/Slack/WhatsApp notifications (in-app only for now).
- Cross-org "external reviewer" (client) accounts.
- File preview inside the comment thread (links + download only).
- KPI weighting / multiple weekly scorers (single manager, single 0–10 score, as specified).

Say "go" and I'll build it in one pass, starting with the migration.
