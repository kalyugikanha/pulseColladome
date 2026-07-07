# Navigation Consolidation — 8-Item Sidebar

Restructure the sidebar into 8 top-level items with role-based tabs and scoped filters. Pure IA / routing / UI change — no data-model or permission-rule changes.

## Final sidebar (in order)

1. **Dashboard** — `/dashboard` (unchanged)
2. **Tasks** — `/tasks` (unified)
3. **Attendance** — `/attendance` (unified)
4. **Projects** — `/projects` (Burn moves inside project detail)
5. **Team** — `/team` (Leave + Calendar + Directory as tabs)
6. **Performance** — `/performance` (unified)
7. **Business Development** — `/bd` (unchanged, role-gated to BD dept / managers / admins as today)
8. **Resource Hub** — `/resources` (unchanged)

Admin-only surfaces that don't fit the 8 (Workflows, Finances, HR Leaves, Onboarding approvals, Onboarding, Team Meetings, Vendors, Access & Roles) collapse into a single **Admin** group at the bottom of the sidebar, visible only to users who already qualify for them. This keeps the primary nav at 8 items for everyone.

## 1. Tasks (`/tasks`)

Single page. URL search params drive state so links are shareable.

- **View toggle** — List ↔ Kanban (`?view=list|kanban`)
- **Scope filter** — Mine / My Department / All (`?scope=mine|dept|all`), gated by role: employees only Mine; dept heads / reporting managers up to Dept; admins All.
- **Dept picker** — shown when scope=dept for users who lead more than one department (`?dept=marketing|business-development|tech`).
- **Header actions**:
  - **Templates** button → dialog listing task templates with Create / Edit / Duplicate. Gated to users who can currently manage templates.
  - **Manage taxonomy** button → drawer for Domain / Department / Task Type (content from `/admin/taxonomy`). Gated to super admin / dept head / reporting manager.

Redirects to preserve deep links:
- `/board/$dept` → `/tasks?view=kanban&scope=dept&dept=$dept`
- `/admin/taxonomy` → `/tasks?manage=taxonomy` (still role-gated)
- `/my-timesheet` handled under Attendance (see §2)

## 2. Attendance (`/attendance`)

Tabs (`?tab=…`), triggers role-gated:
- **My Attendance** — everyone. Punch in/out card + personal daily/weekly history (from current `/punch`).
- **Timesheet** — everyone sees their own roll-up (from `/my-timesheet`); managers/dept heads/project managers additionally see a "Team" sub-view (from `/timesheet`) via an inner scope toggle.
- **Team View** — admins, HR admin, dept heads, reporting managers only. Content from current admin `/attendance`.

Default tab: employees → My Attendance; managers land on the last tab they used (persisted via URL param).

Redirects: `/punch` → `/attendance?tab=my`; `/my-timesheet` → `/attendance?tab=timesheet`; `/timesheet` → `/attendance?tab=timesheet&scope=team`.

## 3. Projects — Burn inside detail

- Sidebar item **Project Burn** removed.
- Inside the project detail page, add a **Burn** tab (or section) that renders the current `/project-burn` body scoped to that project id. Tab visible to finance admin / dept head / reporting manager (same gating as today).
- `/project-burn` redirects to `/projects` (list) so old links don't 404.

## 4. Team (`/team`)

New route with tabs:
- **Leave** — content from `/leave`
- **Calendar** — content from `/calendar`
- **Directory** — content from `/directory` (visible only to roles that see it today: super admin, HR admin, dept head, reporting manager). For users without Directory access, the tab is hidden and default lands on Leave.

Redirects: `/leave` → `/team?tab=leave`; `/calendar` → `/team?tab=calendar`; `/directory` → `/team?tab=directory`.

## 5. Performance (`/performance`)

Tabs (role-gated):
- **My Performance** — everyone.
- **Team** — reporting managers, dept heads, admins.
- **Output Analytics** — dept heads, admins.

## Admin group (bottom of sidebar, unchanged surfaces)

Kept as-is, still role-gated per current rules:
Workflows · Finances · HR Leaves · Onboarding approvals · Onboarding · Team Meetings · Vendors · Access & Roles.

## Implementation steps

1. **Refactor route bodies into components** so tabs can compose them cleanly:
   - Extract `PunchPanel`, `MyTimesheetPanel`, `TeamTimesheetPanel`, `AdminAttendancePanel` from `punch.tsx` / `my-timesheet.tsx` / `timesheet.tsx` / `attendance.tsx` into `src/components/attendance/`.
   - Extract `LeavePanel`, `CalendarPanel`, `DirectoryPanel` into `src/components/team/`.
   - Extract `MyPerformancePanel`, `TeamPerformancePanel`, `OutputAnalyticsPanel` into `src/components/performance/` (Team + Output currently live inside `performance.tsx`; split them out).
   - Extract `TasksListView` and `TasksKanbanView` from `tasks.tsx` and `board.$dept.tsx` into `src/components/tasks/`.
   - Extract `ProjectBurnPanel` from `project-burn.tsx` into `src/components/projects/`.
   - Extract `TaxonomyPanel` from `admin.taxonomy.tsx` and expose a `TemplatesPanel` (lifted from Workflows if that's where templates live today; otherwise a stub wired to the existing template store).

2. **Rewrite unified route files**:
   - `src/routes/_authenticated/attendance.tsx` — tabs + role gating, reads `?tab=`.
   - New `src/routes/_authenticated/team.tsx` — tabs + role gating.
   - `src/routes/_authenticated/performance.tsx` — tabs + role gating.
   - `src/routes/_authenticated/tasks.tsx` — toolbar (view toggle, scope filter, dept picker, Templates, Manage taxonomy) + dialogs; renders list or kanban based on `?view=`.

3. **Add Burn tab** to the project detail page (find current detail route under `projects.*`; if none exists yet, add a `Burn` section to the existing projects UI where a project is selected).

4. **Replace old route bodies with redirects** (keep files so links resolve):
   `/punch`, `/my-timesheet`, `/timesheet`, `/board/$dept`, `/admin/taxonomy`, `/leave`, `/calendar`, `/directory`, `/project-burn`. Each becomes a route whose `beforeLoad` throws `redirect({ to: "…", search: {…} })`.

5. **Rewrite sidebar** `src/routes/_authenticated/route.tsx`:
   - Replace `employeeItems` and the current groups with two groups:
     - **Workspace**: Dashboard, Tasks, Attendance, Projects, Team, Performance, Business Development, Resource Hub.
     - **Admin** (only if the user matches any admin surface): Workflows, Finances, HR Leaves, Onboarding approvals, Onboarding, Team Meetings, Vendors, Access & Roles.
   - Business Development stays gated with the existing `isBd` logic.

6. **Dashboard quick actions**: update the "Punch out" link (`/punch` → `/attendance?tab=my`) and any "View all tasks" links; no behavior change.

## Out of scope

- Permission rules themselves (only tab visibility uses them).
- Data model, RLS, task/rating/review logic.
- Visual redesign of individual panels — they render as-is inside their new host.

## Rollout note

All old URLs redirect, so bookmarks and shared links keep working. If the user prefers deleting old routes outright instead of redirecting, that's a one-line change per file — I'll default to redirects for safety.
