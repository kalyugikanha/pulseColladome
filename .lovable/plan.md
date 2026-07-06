## Goal
Let every logged-in employee see all projects in the project picker when logging hours (timesheet, day editor, punch, vendors, etc.).

## Problem
The `projects` table currently restricts SELECT to managers, department heads, project creators, and users assigned/creating a task on the project. So a regular employee opening their timesheet only sees a subset (often empty) in the project dropdown.

## Change
Add a new RLS SELECT policy on `public.projects`:

```sql
CREATE POLICY "projects: all authenticated read"
ON public.projects
FOR SELECT
TO authenticated
USING (true);
```

Existing manager/dept-head/involved policies remain (harmless — RLS is permissive/OR). Write policies (INSERT/UPDATE/DELETE via `can_manage_projects`) are unchanged, so only managers can still create or edit projects.

No frontend changes needed — every existing `supabase.from("projects").select(...)` call will start returning the full list automatically.

## Files
- New migration adding the policy above.
