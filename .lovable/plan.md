## Timesheet — hours × project matrix

New page `/timesheet` (top-level sidebar item, gated to admins + project managers) showing a pivot table of employee × project hours for a selected month.

### Layout

- Header: page title, month picker (defaults to current month), export‑CSV button.
- Filters row: employee multi‑select (default = all), project multi‑select (default = all).
- Sticky pivot table:
  - Left column: Employee (name + role/dept subtitle). Frozen.
  - Column headers: one column per project active in the month (code + short name). Frozen top.
  - Cells: total hours logged that month for that employee on that project. Blank = 0. Hover shows day‑by‑day tooltip.
  - Right‑most column: **Total** hours per employee.
  - Bottom row: **Total** hours per project + grand total.
- Empty state: "No hours logged in <month>."

### Interaction

- Click a cell → drawer with day‑by‑day entries (date, hours, comments if any).
- Rows and columns sortable (by name/code, by total desc).
- CSV export mirrors the visible matrix (respects filters).

### Access

- Route sits under `_authenticated/timesheet.tsx`; component guard: if not `me.isAdmin && !me.canManageProjects` → redirect to `/dashboard`.
- Sidebar link visible only when `canManageProjects || isAdmin`.

### Data

- Single Supabase read: `attendance_logs` for the month.
- Client‑side pivot in `useMemo`. No new tables, no migration, no server functions.
- Uses the same shape Project Burn already reads (`tasks: [{project_code, project_name, hours}]`).

### Files

- new: `src/routes/_authenticated/timesheet.tsx`
- edit: sidebar component (add "Timesheet" item with `TableProperties` icon between Hours Editor and Project Burn)

### Not doing

- No editing (that's Hours Editor).
- No cost/burn column (that's Project Burn).
- No multi‑month view.
