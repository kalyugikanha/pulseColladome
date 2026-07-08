## Fix: Include completed tasks in the punch-out task picker

**Problem:** When punching out, the task dropdown hides tasks assigned to me that are already marked done. People often complete a task and then log time against it at punch-out, so those tasks must still be selectable.

**Change (single file: `src/routes/_authenticated/punch.tsx`):**

In the `my-open-tasks` query (~line 104), remove the `.neq("status", "done")` filter so all tasks assigned to the current user with a project attached are returned. Keep the rest (assignee filter, project-required filter, ordering, 200-row limit) unchanged.

Optionally show the status as a subtle badge in the `TaskCombobox` item row so it's clear which are done vs. in-progress — I'll add a small muted "Done" label next to done tasks to avoid confusion.

No backend, RLS, or business-logic changes. Scope is limited to the punch-out modal's task list.