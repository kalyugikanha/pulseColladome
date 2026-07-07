## Fixes for the department board (`/board/:dept`)

### 1. Include workflow-based tasks on the right department board

**Current behavior:** `fetchBoardCards({ department })` filters strictly by `assignee.department`. A task created from a Marketing workflow but assigned to an admin (or anyone whose profile department ≠ "Marketing") is silently excluded — that's why your workflow task didn't appear on the Marketing board.

**Fix:** in `src/components/board/board-kanban.tsx`, broaden the department match so a task shows on a dept board if **either**:
- the assignee's `profiles.department` matches, **or**
- the task's `workflow_template.department` matches (via `workflow_instances.template → workflow_templates.department`).

We already load workflow instances/templates in `fetchBoardCards`; extend that lookup to also return `workflow_templates.department`, then keep any row where either condition matches. Unassigned workflow tasks also become visible on the correct board this way.

### 2. Project + Assignee filters on the department board

Add two `MultiSelectFilter` dropdowns (component already exists at `src/components/multi-select-filter.tsx`) to the header of `src/routes/_authenticated/board.$dept.tsx`:

- **Project** — populated from `projects` table (id + name).
- **Assignee** — populated from the set of people currently visible on that board (assignees present in the fetched cards, plus an "Unassigned" option).

Filtering is applied client-side to the cards returned from `fetchBoardCards` before rendering, so the kanban re-renders instantly without extra queries. Selection state lives in `useState` on the page. Empty selection = "All".

To support filtering by project, extend `BoardCard` to carry `project_id` and `project: { id, name }` (already easy to add to the existing select in `fetchBoardCards`).

### Files touched

- `src/components/board/board-kanban.tsx` — expand select to include `project_id, project(name)` and workflow template department; update filter logic; extend `BoardCard` type.
- `src/routes/_authenticated/board.$dept.tsx` — add project & assignee `MultiSelectFilter` dropdowns; apply filters to fetched cards; wire query invalidation.

No DB migration, no changes to `My Tasks`, workflow creation, or other pages.
