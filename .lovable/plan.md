## Fix
Replace the native `<input type="month">` on `/project-burn` with the same Month + Year shadcn `Select` pair used on the Timesheet page, driving the existing `month` state (`YYYY-MM`).

## Details
- File: `src/routes/_authenticated/project-burn.tsx`
- Remove the `Input`/`Label` month field (and `Input`/`Label` imports if unused elsewhere in the file).
- Add Month select (Jan–Dec, values `01`–`12`) and Year select (current year + 4 previous).
- Same on-change behavior: recompose `` `${year}-${month}` `` and `setMonth(...)`.
- No other logic changes.

## Also (optional — say yes/no)
Apply the same swap to `/hours-editor` and `/finances`, which use identical native month inputs. Default is **no** unless you want me to include them.
