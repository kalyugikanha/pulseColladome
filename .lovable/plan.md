## Why only video editors & graphic designers show up

When you open **New task** from a vertical board (e.g. `/board/marketing`), the dialog is passed `defaultDepartment={dept}` and the assignee dropdown query filters `profiles` by that department. On the Marketing board that leaves only teammates whose `department = 'marketing'` — which in your data is just the video editors and graphic designers. Everyone else (BD, Tech, HR, admins, etc.) is filtered out.

## Fix

Remove the department filter from the assignee picker so any teammate can be assigned from anywhere, matching the "task assignment open to everyone" behavior we already established.

### Changes
1. **`src/routes/_authenticated/tasks.tsx`** — in `NewTaskDialog`:
   - Drop the `defaultDepartment` filter on the `people-lite` query; always fetch all active profiles ordered by name.
   - Keep `defaultDepartment` prop (still useful for future defaults like project pre-selection) but don't use it to narrow assignees.
   - Add a simple search input above the assignee list so long org rosters stay usable (Command/Combobox-style filter inside the Select, or a text filter above the list).

2. **`src/routes/_authenticated/board.$dept.tsx`** — no code change required; the prop is now cosmetic.

No DB or RLS changes needed — `profiles` is already readable to authenticated users.