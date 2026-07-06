## Add "Logged hours" column to Finances table

Update `src/routes/_authenticated/finances.tsx` to show total logged hours per employee for the selected month, making it easy to see why some salaries are unallocated (0 hours logged).

### Changes

1. **Compute per-user total logged hours for the month** — aggregate all time entries (across all projects) grouped by `user_id` within the selected month's date range. Currently the page only sums project-coded hours per user for the burn calc; this new memo will include every time entry regardless of project coding.

2. **Add a "Logged hours" column to the employee table** — new column between the employee name and the burn amount, showing e.g. `168.0 hrs` or `0.0 hrs`.

3. **Apply to both sections:**
   - Allocated employee rows: show their total logged hours for the month.
   - Unallocated employee detail rows (Akash, Chirag, Shraddha, Hemanth): show `0.0 hrs` (or their actual logged hours if any exist that weren't project-coded).

4. **No changes to calculations** — this is a display-only addition to help trace the numbers.

### Technical notes

- Reuse existing `timeEntries` query; add a `loggedHoursByUser` memo keyed by `user_id`.
- Add one `<TableHead>` and one `<TableCell>` per row; keep column alignment right for numeric.
