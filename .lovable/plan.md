## Root cause

`public.tasks.project_id` is NOT NULL, but Marketing Kanban tasks and cross-department requests have no project. The insert fails the constraint.

## Fix

Migration: make `public.tasks.project_id` nullable.

```sql
ALTER TABLE public.tasks ALTER COLUMN project_id DROP NOT NULL;
```

That's it — no code change needed. Existing project-scoped task creation still passes a `project_id`; Marketing / crossover inserts leave it null.

## Verify

Create a Marketing task and a crossover request; both should succeed and appear in the board.
