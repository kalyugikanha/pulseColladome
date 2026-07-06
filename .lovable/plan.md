## Plan

1. **Fix backend table access for projects**
   - Add the missing database access grants for `projects` so signed-in users can reach it through the app.
   - Keep the existing row-level rules intact: only project managers, HR admins, admins, and department heads can create/edit projects.

2. **Verify Aakash’s permission path**
   - Confirm `akash@colladome.in` still has the `project_manager` role.
   - Confirm the project-management rule recognizes that role after the database access fix.

3. **Validate in the app**
   - Check that the Projects page can show the project actions for a user whose `canManageProjects` flag is true.
   - Ensure the existing project search remains unchanged.

## Technical details

The current blocker is not his role: Aakash has `project_manager`. The issue is that the `projects` table currently has no explicit Data API grants, so the app can be blocked before the row-level project-manager policy can allow create/edit. I’ll add the missing grants via a database migration only; no UI change is needed unless validation reveals a separate frontend issue.