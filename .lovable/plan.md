## Goal
When punching out, users should be able to allocate hours against tasks they have already marked **Done** (in addition to their active To-do / In-progress / In-review tasks).

## Changes

**File:** `src/routes/_authenticated/punch.tsx`

1. **Task query (`my-open-tasks`)** — currently unbounded. Restrict and clarify:
   - Filter `status IN ('todo','in_progress','review','done')` (exclude `cancelled` / archived).
   - Order so **active tasks appear first**, then Done tasks, sorted by most recent update — so Done tasks are visible but don't crowd out active ones.
   - Rename queryKey to `my-punch-tasks` for clarity.

2. **TaskCombobox rendering** — the existing `t.status === "done"` label stays. Add a subtle grouping / separator: active tasks listed first, then a "Recently completed" heading followed by Done tasks. Both groups are searchable and pickable.

3. **Empty state copy** — keep the current "Allow with project only" behavior. Update the "no open tasks" warning to say "No active or recently completed tasks — pick a project or request a task."

## Out of scope
- No DB / server-fn changes.
- No changes to punch-out validation or hours-before-review logic.
- No date filter on Done tasks (all Done tasks assigned to the user remain pickable; ordering handles noise).
