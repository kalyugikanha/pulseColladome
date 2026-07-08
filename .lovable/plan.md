## Kanban: per-column sort button + smoother reordering

Two problems to fix:
1. Reorder is clumsy — thin drop slots between cards, cards jump around, hard to hit the target.
2. No quick way to reset one column to due-date order without wiping the whole board's manual ranks.

### 1. Per-column "Sort by due date" button
Add a small button in each column header (next to the count) that, on click:
- Reassigns `manual_rank` on every card in THAT column (that the user can update) so they end up in ascending due-date order (nulls last, priority tiebreaker).
- Uses evenly spaced ranks (e.g. `1024, 2048, 3072, ...`) so subsequent drags still have room to insert between neighbors.
- Calls a new server fn `sortColumnByDueDate({ status, taskIds })` that runs a single `upsert`/batched update — RLS silently skips cards the user can't update, and we report "Sorted N cards" (skipped M) via toast.
- After that, the user can still drag any card to override — same behavior as today, just starting from a clean due-date order in that one column.

The existing global "Clear manual order" button and the global sort dropdown stay as they are.

### 2. Smoother drag-and-drop
Replace the current thin drop-slots-between-cards model with a **whole-card hover target** using `@dnd-kit/sortable` (already a transitive dep of `@dnd-kit/core`; add explicitly if missing).

Concretely:
- Wrap each column's card list in `SortableContext` with `verticalListSortingStrategy`.
- Each card becomes a `useSortable` item — the whole card is the drop target, cards animate out of the way as you hover, no more tiny 8px slots to aim at.
- Column itself stays a `useDroppable` for empty-column drops and cross-column moves.
- `onDragOver` handles cross-column preview (card visually moves into the new column before drop); `onDragEnd` commits: computes fractional midpoint rank based on final neighbors and calls existing `reorderKanbanCard`.
- Keep the existing `DragOverlay` for the "floating card" visual — it's fine.
- Keep existing gating (`canMoveTask`), workflow-transition detour to `TaskDetailSheet`, and optimistic cache update.

Net effect: dragging feels like Trello/Linear — cards shuffle live, drop anywhere on a card to place there, no more hunting for a 4-8px gap.

### 3. Files
- `src/lib/tasks-workflow.functions.ts`: add `sortColumnByDueDate` server fn. Input: `{ status, taskIds }`. Server fetches those tasks' `due_date` + `priority`, sorts them, then issues a batched `upsert` on `id` setting `manual_rank = 1024 * (index+1)`. Uses `requireSupabaseAuth` — RLS handles permission, returns `{ updated, skipped }`.
- `src/components/board/board-kanban.tsx`:
  - Add `sortColumnByDueDate` button in `Column` header (icon + tooltip: "Sort this column by due date").
  - Replace `DropSlot` between-cards model with `SortableContext` + `useSortable` per card.
  - Update `onDragOver`/`onDragEnd` to use the sortable item indexes for rank computation.
  - Remove `DropSlot` component.
- No schema changes. No RLS changes.

### Assumption
Sorting a column stores explicit `manual_rank` values (doesn't just set them to `NULL`), so the order sticks even if the global sort dropdown is on "Manual" — and stays overridable by drag. Tell me if you'd rather have it just clear `manual_rank` for that column (which only works cleanly when the global sort is on "Due date").
