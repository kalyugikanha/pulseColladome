## Problem

RLS already allows reporting managers and department heads to INSERT tasks for their reportees (`tasks: reporting manager insert`, `tasks: dept head insert`). The gap is purely UI: the "New task" dialog on **My Tasks** (`src/routes/_authenticated/tasks.tsx`) hard-codes `assigneeId: me!.id`, so Kanishka, Arpit, and every other reporting manager / dept head can only create tasks on themselves. There is no other place in the app where a non-admin can create a task for someone else.

## Change

Add an **Assign to** field in the existing New Task dialog, visible whenever the current user is a reporting manager, a department head, an admin/PM, or a super admin. Regular employees see no change — the field is hidden and the task is still created against themselves.

### Behavior

- Default assignee = the current user (keeps the fast path unchanged).
- Options in the picker:
  - Self (always)
  - Direct reports (from `me.directReportIds`)
  - Members of departments the user heads (from `me.headOfDepartments` → `profiles.department in (...)`), if `me.isDepartmentHead`
  - All active employees, if `me.isAdmin || me.isSuperAdmin || me.canManageProjects`
- De-duplicate + sort by name. Show name and department.
- Submit uses the selected id in `createTaskFull({ assigneeId })`; existing server function and RLS already accept it for these roles.
- Preset "bump" continues to key off the current user (personal quick-preset chips), not the assignee.

### Discoverability

No new page. Same **New task** button on `/tasks`. A short helper line under the field ("You can assign to your direct reports and department members") only when the picker is shown, so managers immediately see the capability.

## Files

- `src/routes/_authenticated/tasks.tsx` — add assignee state, fetch eligible assignees (single query filtered by scope), render `<Select>` above the Project field when the user is a manager/head/admin, pass selected id to `createTaskFull`, reset on close.

No RLS, server function, or schema changes. No changes to task-templates or tasks-overview.

## Out of scope

- Bulk assignment / assigning to multiple people at once.
- A dedicated "Team tasks" management screen (can be a follow-up if you want a team-first view instead of the shared New Task dialog).
