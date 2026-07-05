## Hours editor blank for Kanishka

Line 121 of `src/routes/_authenticated/hours-editor.tsx` still has `if (!me.isSuperAdmin) return null;` — an early return that fires before the grid renders. The earlier fix updated the redirect guard and query scope, but missed this second gate, so department heads land on an empty page.

### Fix

Replace with `if (!(me.canManageProjects || me.isDepartmentHead)) return null;` to match the redirect guard and query `enabled` flag. Also swap the "Super admin only." helper caption to something accurate ("Edit teammates' monthly hours per project.").

### Verify

View as Kanishka → /hours-editor loads the grid populated with the 5 Marketing teammates.
