## Goal

Let managers (not just admins) run BD for their reporting tree — create recurring items, assign one-off ad-hoc tasks, view/edit their team's daily logs, and see team reports. Reporting depth = full tree (you → Juhi → Sarita/Riyanji).

## Reporting tree helpers (DB)

Add security-definer helpers in `private` schema (reuse existing `profiles.reporting_manager_id`):

- `private.bd_report_ids(_manager uuid) returns setof uuid` — recursive CTE walking `profiles.reporting_manager_id` down from `_manager`, returning the full subtree (excluding the manager themselves).
- `private.can_manage_bd_user(_actor uuid, _target uuid) returns boolean` — true if `_actor` is admin/super-admin, OR `_target` is in `bd_report_ids(_actor)`, OR `_actor = _target` (self).
- `private.bd_visible_user_ids(_actor uuid) returns setof uuid` — admins/super-admins → all active profiles; managers → self + full subtree; regular employees → self only.

These make RLS trivial and are reused by every BD screen.

## RLS updates

- `bd_recurring_items`: replace admin-only policies with `USING/WITH CHECK (private.can_manage_bd_user(auth.uid(), assignee_id))` for INSERT/UPDATE/DELETE; SELECT allowed when the row's assignee is in `bd_visible_user_ids(auth.uid())` (so managers see team templates + their own).
- `bd_activity_logs`: SELECT when `user_id in bd_visible_user_ids`; INSERT/UPDATE/DELETE when `can_manage_bd_user`. Keeps employees on own rows, opens managers to their subtree, admins keep full.
- `bd_activity_types`: unchanged (admin-managed lookup).

## Server functions (`src/lib/bd.functions.ts`)

Extend / add:

- `listBdVisibleUsers()` — returns `{id, full_name, email, department}[]` for the actor's scope (drives user pickers, filters, reports).
- `listBdRecurringItems({ assigneeId? })` — scoped by RLS; supports filtering to one teammate.
- `upsertBdRecurringItem(...)`, `deleteBdRecurringItem(id)` — already exist; now callable by managers because RLS allows it.
- `assignBdOneOffTask({ assignee_id, log_date, title, activity_type_id, hours_estimate?, description? })` — new. Inserts a `bd_activity_logs` row for the given date/user with `status = 'pending'` and `recurring_item_id = null`, marked `assigned_by = auth.uid()` (new column). Enforces `can_manage_bd_user`.
- `listBdLogsForUser({ user_id, date })`, `listBdLogsForRange({ user_ids?, from, to })` — scoped reads for team views and reports.
- `updateBdLog(...)`, `rollForwardBdPending(...)` — allow managers to edit/close their team's logs (RLS enforces).

## Schema tweaks

- `bd_activity_logs`: add `assigned_by uuid null references profiles(id)` and `title text null` (one-off tasks need a title; recurring rows keep title from template). Backfill nothing.
- Migration adds the three `private` helpers, replaces RLS policies as above.

## UI changes

Sidebar item stays "Business Development". Existing tabs adjusted:

1. **My Day** (`bd/index.tsx`) — unchanged for the logged-in user; still shows their own auto-generated recurring items + any one-off tasks a manager pushed onto that date.

2. **Team** (new, `bd/team.tsx`, visible to anyone with reports OR admins) —
   - Date picker (defaults today).
   - Left column: teammate list from `listBdVisibleUsers()` minus self, grouped by direct reports vs indirect (small subtitle). Click a teammate → right panel loads their log for that date.
   - Right panel: read-only preview of their pending / done items + a **"Mark done" / "Edit hours" / "Add note"** inline actions (RLS-allowed) + **"+ Assign one-off task"** button → dialog with title, activity type, optional hours estimate → calls `assignBdOneOffTask`.
   - "Roll pending forward" button for that teammate/date.

3. **Recurring items** (`bd/recurring.tsx`) — opens to admins as today; now also opens to any manager. Add a "For teammate" dropdown at top (defaults to self) sourced from `listBdVisibleUsers()`. All CRUD scoped by that selection; RLS backstops.

4. **Reports** (`bd/reports.tsx`) — visible to admins AND managers. Data auto-scoped to `bd_visible_user_ids`. Filters unchanged (date range, activity type, member multi-select). Admins still see everyone.

5. **Activity types** (`bd/activity-types.tsx`) — remains admin-only.

## Access summary

| Role | My Day | Team | Recurring items | Reports | Activity types |
|---|---|---|---|---|---|
| Employee (no reports) | ✅ self | — | ✅ self only | — | — |
| Manager (has reports) | ✅ self | ✅ subtree | ✅ self + subtree | ✅ subtree | — |
| Admin / super admin | ✅ self | ✅ everyone | ✅ everyone | ✅ everyone | ✅ |

Tab visibility is driven by `me.hasReports` (derived client-side from `listBdVisibleUsers().length > 1`) and existing `isAdmin` / `isSuperAdmin` flags.

## Files touched

- Migration: new `private` helpers, altered RLS on `bd_recurring_items` + `bd_activity_logs`, new columns on `bd_activity_logs`.
- `src/lib/bd.functions.ts` — extend with new fns, adjust existing ones to drop admin-only guards (RLS enforces).
- `src/routes/_authenticated/bd.tsx` — add "Team" tab, gate visibility on `hasReports || isAdmin`.
- `src/routes/_authenticated/bd.team.tsx` — new route.
- `src/routes/_authenticated/bd.recurring.tsx` — add teammate dropdown, drop admin-only gate.
- `src/routes/_authenticated/bd.reports.tsx` — drop admin-only gate; keep filters.
- `src/routes/_authenticated/bd.index.tsx` — render one-off assigned tasks alongside recurring items (small "assigned by X" tag).

No changes to Marketing / tasks module.
