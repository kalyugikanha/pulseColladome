## Kanban: drag-to-reorder within a column (assignee + managers)

Add manual prioritization on top of the existing sort dropdown. Default view still auto-sorts by soonest due date; when someone drags a card within a column, that manual order takes over.

### 1. Schema
Add one nullable column `manual_rank double precision` on `public.tasks`.
- `NULL` → card sorted by the current sort mode (existing behavior).
- Non-null → card is manually ranked; lower value = higher on the board.

New index: `create index tasks_status_manual_rank_idx on public.tasks(status, manual_rank);`

No new RLS. Assignee/reviewer/manager/dept-head/reporting-manager/project-manager already have UPDATE on `tasks`, which is exactly the set of people we want to let reorder — the assignee themselves and their managers. Non-managers cannot reorder someone else's task; that's the correct behavior.

### 2. Sort mode
Add a new option **"Manual (drag to reorder)"** to the existing sort dropdown, and make it the default (persist in `localStorage`; existing users keep whatever they had). In every mode:
- Sort primary: `manual_rank` ascending, `NULL`s go to the end.
- Sort secondary: whatever the current sort key is (due date / priority / recently created).
- So even in "Due date" mode, a card someone dragged to the top stays on top; the rest sort by date underneath.

If the user prefers pure sort (no manual override), a small "Clear manual order" button in the header wipes `manual_rank` for all their visible cards in this board (only cards they can UPDATE).

### 3. Drag behavior
- Existing cross-column DnD stays. Add within-column drop targets (drop between cards).
- On drop: compute new rank as midpoint between the ranks of the cards above and below the drop position (standard fractional-index approach). If dropped at the top, `above.rank - 1`; at the bottom, `below.rank + 1`. Guarantees O(1) writes without renumbering.
- If the dragged card doesn't have UPDATE permission, disable drag and show tooltip.
- Optimistic update via existing React Query cache; call a new server fn `reorderKanbanCard({ taskId, newRank })` that updates `manual_rank` (and `status` if the column changed — merge with existing cross-column move).

### 4. Files
- Migration: add `manual_rank` column + index on `public.tasks`.
- `src/lib/tasks-workflow.functions.ts`: add `reorderKanbanCard` server fn (auth via existing RLS — errors clearly if 0 rows updated, same pattern we just applied).
- `src/components/board/board-kanban.tsx`:
  - Extend `BoardCard` type with `manual_rank: number | null`.
  - Add `manual_rank` to the SELECT projection (fetcher).
  - Add "Manual" to `SortKey`, make it default.
  - Update `compareCards` so `manual_rank` (asc, nulls last) is always primary.
  - Add within-column droppable slots and `onDragEnd` handling that computes fractional rank and calls the new server fn.
  - Reuse existing `canMoveTask` for drag gating.
- No changes to workflow logic.

### Assumption
Manual order is **shared** across viewers (stored on the task), not per-viewer. So if a manager drags a card up for their report, the report sees the same order in their own Kanban — matching how "priority" already behaves. Tell me if you'd rather have per-user order (that would need a separate table and different plan).