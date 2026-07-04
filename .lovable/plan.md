## Fix
Replace the native `<input type="month">` on `/timesheet` with two shadcn `Select` dropdowns (Month + Year) that drive the existing `month` state string (`YYYY-MM`).

## Details
- File: `src/routes/_authenticated/timesheet.tsx`
- Remove the `Input`/`Label` month field.
- Add two `Select`s:
  - **Month**: options Jan–Dec (value = `01`…`12`, label = full month name).
  - **Year**: options current year and 4 previous years (descending).
- On change of either, recompose `` `${year}-${month}` `` and call `setMonth(...)`.
- Keep the CSV filename, card title, empty-state message, and query key using the same `month` string — no other logic changes.

## Not doing
- No calendar popover, no date-fns Calendar component (overkill for month-only).
- No changes to data fetching, pivot, drill-down, or access control.
