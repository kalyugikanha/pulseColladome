## Projects page: search + verify Aakash access

### 1. Aakash's project access
Aakash (`akash@colladome.in`) already has the `project_manager` role, and `can_manage_projects()` + the frontend `canManageProjects` flag both include `project_manager`. Backend-wise he should already see New/Edit/Task/Time-log buttons on `/projects`.

Action: no backend change needed. The likely cause is a stale cached session on his browser. If he still can't edit after a hard refresh / sign-out + sign-in, we'll instrument further — but the data + rules already permit him.

### 2. Search on /projects
- Add a search input in the header of `src/routes/_authenticated/projects.tsx`.
- Case-insensitive substring match against `code`, `name`, and `client_name`.
- Applied client-side over the already-fetched `projects` list before rendering the cards.
- Empty-state message updates to "No projects match '<query>'" when the filter hides everything.

No schema changes, no new dependencies.
