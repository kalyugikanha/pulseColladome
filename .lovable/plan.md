# Marketing Kanban — Build Plan

Scope: a Marketing-only Kanban experience with a simplified task modal, forced reassignment on column moves, cross-department requests, and basic notifications. All other departments keep the existing tasks page and modal untouched.

## 1. New route & entry point

- Add route `src/routes/_authenticated/marketing-kanban.tsx`.
- On the existing `/tasks` page, add a **List / Kanban** toggle in the header. If the logged-in user's `profiles.department` is `"Marketing"` (case-insensitive), default to Kanban and route them to the new page. Otherwise default to List; the toggle is hidden for non-Marketing users.
- Add a sidebar item **Marketing Kanban** visible to: anyone in Marketing, department heads of Marketing, admins, super admins, and project managers.

## 2. Kanban board

Fixed columns, left to right (not user-editable):

```text
Script Writing (backlog)
Script Writing – In Progress
Design
Review
Posting
Posted (read-only)
```

- New tasks always land in **Script Writing**.
- Cards show: title, assignee avatar, priority, **Internal deadline** chip, **Scheduled post date** chip, external-request badge (§5) if applicable. Overdue Internal deadline + not in Posted → red indicator.
- Drag-and-drop between columns via `@dnd-kit/core` (already common; will add if missing).
- **Review column special actions** on each card: `Approve` and `Send Back`.
  - Approve → moves card to **Posting**, still prompts reassign (§3).
  - Send Back → inline popover with **Send back to: Script Writing / Design** + optional comment; comment is written to `task_comments` and a `task_activity` entry is logged.
- **Posted** is terminal: no drag out, no approve/send-back, edit disabled (title/desc read-only in detail view for Marketing cards in Posted).

Persistence: reuse existing `tasks.status` for storage. Add a new column-key concept for Marketing (`marketing_stage`) so the 6 marketing columns don't collide with the generic 4-status model used by other departments.

## 3. Simplified task creation modal (Marketing only)

Fields (only these):

- Title (required)
- Description
- Assign to (see §4)
- Internal deadline (date)
- Scheduled post date (date) — always shown, stored separately from `due_date`
- Priority (Low / Medium / High, default Medium)
- Asset links (reuse existing `AssetLinksEditor`)
- Client / Brand dropdown: Colladome, Oswal Soap Group, GrowInsight, NNIS Sports, Other (free text). Admin-editable list.

Auto-set metadata (hidden): `department = Marketing`, `marketing_stage = script_writing`, `created_by`, no reviewer field, no project. Existing project/domain/task-types fields are omitted from the UI.

The old modal on `/tasks` stays exactly as-is for non-Marketing users.

## 4. Assign-to roster (dynamic)

- Roster source: any `profiles.reporting_manager_id` = Kanishka's user id, plus Kanishka. Computed live via query — no hardcoded list. Kanishka's id resolved by lookup of a canonical email or role tag (`marketing_lead`), configurable in one place.
- Admins / super admins / Marketing department heads (via existing `department_heads`) see the same roster but may also assign to anyone in the pool regardless of column.

## 5. Reassignment on column move

- Every drop (including Approve → Posting) opens an inline **Reassign to** popover before the move commits. Default = current assignee (allowed).
- On confirm: update `assignee_id` + `marketing_stage`, insert a `task_activity` row (`kind = "moved"`, from/to columns, old/new assignee, actor, timestamp), and create a notification to the new assignee (§6).
- Assignee avatar always visible on the card.

## 6. Cross-department requests

- Global action **Request from another department** available in the header of every department task view (List and Kanban).
- Modal fields: Requesting dept (auto from creator's profile), Target dept, Title, Description, Deadline, Reason/context.
- Submit → creates a task in the target department's board in its first column. For Marketing, that's Script Writing; for other departments (future-proof), first status = `todo`.
- Card badge: **External Request — from {Dept}, {Requester name}**. Stored on the task row via new columns `origin_department` and `requester_id`.
- When the card reaches the destination's final bucket (Marketing → `marketing_stage = posted`; others → `status = done`), notify the original requester.
- Reporting: analytics queries can filter by `origin_department` vs `department`.

## 7. Notifications

Reuse existing `public.notifications` table.

- On reassignment: notify new assignee (skip if unchanged).
- On crossover card reaching final column: notify `requester_id`.
- (Optional, low-priority) Daily digest — deferred; note as TODO comment, not built this pass.

## 8. Data / backend changes (single migration)

New columns on `public.tasks`:
- `marketing_stage text` — nullable, values: `script_writing`, `script_wip`, `design`, `review`, `posting`, `posted`.
- `scheduled_post_date date` — nullable.
- `client_brand text` — nullable.
- `origin_department text` — nullable.
- `requester_id uuid` — nullable, FK to `profiles(id)`.

New table `public.task_activity_moves` — skip; reuse existing `task_activity` with a new `kind = "stage_moved"` payload (JSON with from/to columns, old/new assignee).

New table `public.marketing_clients` (id, name, active, created_at) — seed with the four names. Admin-editable via a lightweight settings screen (add link in Access page).

RLS additions:
- Marketing tasks: assignee, reporter, Marketing dept members, department heads, admins can read/write; Posted stage blocks non-admin updates (enforced by a `BEFORE UPDATE` trigger on `tasks` when `marketing_stage = 'posted'`).
- `marketing_clients`: read by authenticated, write by admins/super admins.

All new tables include the required `GRANT` block for `authenticated` + `service_role`.

## 9. Files to add / edit

Add:
- `src/routes/_authenticated/marketing-kanban.tsx`
- `src/components/marketing/kanban-board.tsx`
- `src/components/marketing/kanban-card.tsx`
- `src/components/marketing/reassign-popover.tsx`
- `src/components/marketing/new-marketing-task-dialog.tsx`
- `src/components/marketing/crossover-request-dialog.tsx`
- `src/lib/marketing-tasks.functions.ts` (createMarketingTask, moveMarketingCard, reviewApprove, reviewSendBack, listMarketingBoard, listMarketingRoster, createCrossoverRequest)
- One Supabase migration for §8.

Edit:
- `src/routes/_authenticated/tasks.tsx` — add List/Kanban toggle for Marketing users; add "Request from another department" button.
- Sidebar component (`src/components/app-sidebar.tsx` or equivalent) — add Marketing Kanban entry.
- `src/routes/_authenticated/access.tsx` — admin editor for Marketing clients.

## 10. Explicitly out of scope

- No changes to the existing multi-stage workflow, `/tasks` list layout for non-Marketing users, or the current `task-detail-sheet` behavior for non-Marketing tasks.
- No SLA / automation rules beyond the overdue chip.
- No daily digest in this pass.

---

**Open question before I build:** Kanishka's identity — do you want me to (a) resolve her by a hardcoded email like `kanishka@colladome.com`, (b) tag her via a new `marketing_lead` role in `role_grants`, or (c) treat "Marketing head" from `department_heads` as the roster root (so it works even if the lead changes)? Option (c) is the most durable and matches your dynamic-roster requirement — I'll default to (c) unless you say otherwise.
