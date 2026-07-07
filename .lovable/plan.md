## Goal

Group Marketing Kanban + Business Development under a new sidebar section "Project Management", lock down write/move access per team, upgrade the Marketing cross-department flow, and set the BD reporting tree — without deleting any existing rows.

## 1. Sidebar: new "Project Management" group

In `src/routes/_authenticated/route.tsx`:
- Remove the "Marketing Kanban" and "Business Development" items from the Workspace list.
- Add a new `SidebarGroup` labelled **Project Management** with two children:
  - **Marketing** → `/marketing-kanban` (visible to everyone — anyone can browse the board)
  - **Business Development** → `/bd` (visible only to BD team: `department = 'Business Development'`, plus admins/super-admins and BD reporting-tree managers). Add a `myDept` check + a small `isBdVisible` flag.

## 2. Marketing Kanban — read-open, write-restricted, better crossover

File: `src/routes/_authenticated/marketing-kanban.tsx`

- Compute `isMarketingMember = department === 'Marketing' || headOfDepartments includes marketing || isAdmin || isSuperAdmin`.
- **Read**: unchanged (query runs for everyone).
- **Write gates**:
  - Drag/drop, Approve, Send back, New task, Clients: only when `isMarketingMember` (buttons hidden, `DndContext` no-op for non-members, guarded in `commitMove`).
  - Cross-department "Request" button: available to everyone (that's the whole point).
- **Crossover dialog** (`CrossoverDialog`) upgrades:
  - Requesting department: **auto-populated read-only** from `profiles.department` (fallback "Unknown", editable only if empty).
  - Requester name: shown as a read-only line ("Requesting as: {me.fullName}"). `requester_id` already set from `me.realId`.
  - Add **Information** field (multi-line textarea) and **References** (repeatable `{label, url}` list, same UI as New task's asset links). Stored as `asset_links` on the task; the free-text "Information" appends into `description` alongside existing Reason/context.
  - Remove the target-department picker — this dialog is Marketing-only crossover, so always create a Marketing task.
  - On submit: create the task with `marketing_stage = 'script_writing'`, `status = 'todo'`, `department_id = <Marketing>`, and **auto-assign to Kanishka** by looking up `profiles` where `lower(email) = 'kanishka@colladome.in'`. If not found, fall back to the Marketing head (first `department_heads.user_id where department = 'Marketing'`). Insert a `notifications` row for Kanishka.
- **Requester progress visibility** — already works: rows are visible via existing tasks RLS (`can_view_task` covers `t.created_by = auth.uid()`, and the requester is the creator). To make it tangible, add a small **"My requests"** collapsible strip above the columns for non-Marketing viewers showing their `requester_id = me` tasks with current stage, and clicking opens the existing `TaskDetailSheet` (which already shows comments/output). Marketing members see the full board as today.

No schema changes needed for this part; `tasks.asset_links`, `requester_id`, `origin_department`, `marketing_stage` all already exist.

## 3. Business Development — team-only access + reporting tree

- **Route guard** (`src/routes/_authenticated/bd.tsx`): if user is not BD (department, admin, super-admin, or has any BD reports), render a "Not available" card instead of the tabs. The sidebar link is also hidden per §1.
- **Data migration** to set the reporting tree by email (no deletes, only `UPDATE profiles SET reporting_manager_id = …`):
  - Shubham Saxena — top of BD tree (`reporting_manager_id` untouched unless null).
  - Juhi, Jagjeet, Chirag → report to Shubham.
  - Riyanshi, Sarita → report to Juhi.
  - Also ensure their `department = 'Business Development'` where currently null/empty (do not overwrite existing non-null values that differ, just log).
  - Aarti (super admin) needs no change — `bd_visible_user_ids` already returns everyone for admins/super-admins.
- Existing SQL (`private.bd_visible_user_ids`, `private.can_manage_bd_user`, RLS on `bd_activity_logs` / `bd_recurring_items`) already implements the "Juhi sees Riyanshi + Sarita; Shubham sees all three; admins see all" rule via the recursive `bd_report_ids` walk — no policy changes required.

## 4. Preserve data

- No `DROP` / `DELETE` in the migration; only `UPDATE profiles SET reporting_manager_id = <shubham|juhi>` guarded by `WHERE lower(email) = …`.
- No changes to `tasks`, `bd_activity_logs`, or any other data table.

## Technical notes

- Emails I need to resolve at runtime for #2 auto-assign: `kanishka@colladome.in`. For #3 tree updates I'll match by exact lowercased email; I'll ask for the specific emails inline in the migration (using pattern matches on first name @ `colladome.com`/`colladome.in` with `RAISE NOTICE` when a row is missing so nothing silently fails).
- BD sidebar visibility uses the same `myDept` query already present in the layout; extend it to expose `isBdVisible`.
- Marketing write-gating reuses the existing `canAssignAny` computation but broadens it to any Marketing member (not just head/admin) so writers can drag cards.
- Runtime `permission denied for function can_view_task` — silently fix by granting execute on `public.can_view_task(uuid)` to `authenticated` in the same migration (it's called from `TaskDetailSheet`).

## Files touched

- `src/routes/_authenticated/route.tsx` — sidebar regrouping + BD visibility gate.
- `src/routes/_authenticated/marketing-kanban.tsx` — write-gating, crossover dialog rewrite, "My requests" strip.
- `src/routes/_authenticated/bd.tsx` — non-BD access guard.
- New migration — reporting_manager_id updates for BD tree + `GRANT EXECUTE ON public.can_view_task TO authenticated`.

## Out of scope

- Future "Project Management" department tab is left as a placeholder in the new sidebar group; no route added yet.
