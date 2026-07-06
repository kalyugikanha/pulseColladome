## Expand project management rights

Grant full project create/edit/assign access to **HR admins** and **any department head** (in addition to existing admins and project managers). No scoping by department — they see and manage all projects, same as admins.

### Backend (migration)
- Update `private.can_manage_projects(_user_id)` to also return true when the user is `hr_admin` or listed in `department_heads`:
  ```sql
  SELECT private.is_admin(_user_id)
      OR private.has_role(_user_id, 'project_manager')
      OR private.is_hr_admin(_user_id)
      OR private.is_department_head(_user_id);
  ```
- Existing RLS policies on `projects` (and any `tasks`/related tables that key off `can_manage_projects`) automatically pick this up — no policy rewrites needed.

### Frontend
- Update `src/hooks/use-current-user.ts` so `canManageProjects` mirrors the backend rule: `admin || project_manager || hr_admin || department_head`. This flips on the existing "New project", "Edit", "Time log", and "Task" buttons in `src/routes/_authenticated/projects.tsx` without touching that file.
- Sidebar entries in `_authenticated/route.tsx` already show admin project tools when `canManageProjects` is true, so HR admins / dept heads will also see Timesheet, Task Overview, Task Templates.

### Out of scope
- No new role added, no per-department project scoping, no change to who can view projects (existing read policies stay).
