## Kanban sort control (default: closest due date first)

**Where:** `src/components/board/board-kanban.tsx`.

**Change:**
1. Add a small sort dropdown in the board header row (above the columns). Options:
   - Due date (soonest first) — default
   - Due date (latest first)
   - Priority (high → low)
   - Recently created
2. Persist the choice per user in `localStorage` under `kanban.sort` so it sticks across reloads.
3. Sort each column's cards via the existing `byCol` `useMemo` using the selected key. Ties break by priority (high>medium>low) then created_at. Tasks with no due date sink to the bottom under date sorts.
4. Sort applies within columns only — DnD across columns still works. No backend/schema/RLS changes.

Not touching card layout, DnD, or fetchers.