## Goal
Add a "New Task" button to the **My Tasks** page so any authenticated employee can create tasks, not just managers from the Projects page.

## Current State
- Tasks can only be created by admins/project managers via the Projects page (`/projects`).
- The `tasks` table RLS has no INSERT policy for regular employees — only managers can insert.
- The My Tasks page (`/tasks`) is read-only for employees; it shows "No tasks yet. When an admin assigns work to you, it'll appear here."

## Changes

### 1. Database — new RLS INSERT policy for `tasks`
Add a policy that lets any authenticated user insert a task row where `created_by = auth.uid()`.

Policy:
- `CREATE POLICY "tasks: self-create" ON public.tasks FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());`

This is in addition to the existing manager policy — employees can create, managers still have full access.

### 2. Frontend — "New Task" dialog on `/tasks`
Update `src/routes/_authenticated/tasks.tsx`:
- Add a **New Task** button in the page header (visible to all authenticated users).
- Open a dialog with form fields:
  - **Project** — dropdown of existing projects (required; `project_id` is NOT NULL).
  - **Title** — text input (required).
  - **Description** — textarea (optional).
  - **Due date** — date picker (optional).
  - **Priority** — dropdown: Low / Medium / High (default Medium).
  - **Assign to** — dropdown of team members, defaulting to the current user (optional; can be left unassigned).
- On submit, insert into `tasks` with `created_by: me.id`, `status: "todo"`.
- Invalidate the `my-tasks` query so the new task appears immediately.

### 3. Projects query for task creation
The task dialog needs a list of projects to choose from. Reuse the same Supabase query pattern already used on the Projects page:
```ts
supabase.from("projects").select("id, name")
```

## Scope
- No changes to the Projects page.
- No changes to manager task assignment flow.
- No new tables or columns needed.
- Employee-created tasks start in `todo` status and can be updated by the assignee (existing UPDATE policy covers that).

## Plan
1. Migration: add `tasks: self-create` INSERT RLS policy.
2. Code: wire New Task dialog into `/tasks` with the fields above.
3. Verify: create a task from the My Tasks page, confirm it appears and the DB row has the correct `created_by`.