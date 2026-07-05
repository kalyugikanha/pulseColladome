## Overview

Retire the monthly "Hours Editor" and rebuild timesheet flows Clockify-style:
per-day editing everywhere, a manager Timesheet with Month/Range/Day views,
a new "My Timesheet" for employees, and a per-day Approve/Lock workflow.

## 1. Database migration

Add approval + edit-tracking columns to `public.attendance_logs`:

- `approved_at timestamptz null`
- `approved_by uuid null` (references `auth.users` via FK, on delete set null)
- `last_edited_by uuid null`

Ship a small helper function:
- `public.is_day_approved(_user uuid, _date date) returns boolean` (SECURITY DEFINER, checks `approved_at is not null`)

RLS updates on `attendance_logs`:
- **Own update** policy: replace with `auth.uid() = user_id AND approved_at IS NULL` (employees can't edit approved days).
- Keep existing dept-head / reporting-manager / super admin / project-manager policies (they already bypass the approval lock and can unapprove).
- **Own read** policy stays; employees always see their own history.

No change to grants (table already granted).

## 2. Retire the Hours Editor

- Delete `src/routes/_authenticated/hours-editor.tsx`.
- Remove the "Hours Editor" sidebar entry from `src/routes/_authenticated/route.tsx`.

## 3. Timesheet (manager view) — `/timesheet`

Extend `src/routes/_authenticated/timesheet.tsx`:

**View toggle** in the header: `Month` (existing pivot) · `Range` (from/to date range, same pivot but bounded by chosen dates) · `Day` (single-day list of every employee's entries).

**Date controls** react to view:
- Month view: current month/year selects.
- Range view: `from` and `to` shadcn date pickers (defaults to current week).
- Day view: single date picker (defaults to today).

**Manager editing** (super admin / project manager / dept head / reporting manager):
- Existing drill-down `Sheet` becomes an **editable table**: for each entry row, editable `date` (date picker), `project` (Select of project codes), `hours` (numeric), `comments` (text), and a delete (trash) button. "Add row" button at the bottom.
- Save writes back to `attendance_logs.tasks` for the entry's date (upsert row per (user_id, date), rewrite the `tasks` array, recompute `total_hours`). If the date field is changed, remove the task from the old day's row and append to the new day's row.
- Approve controls in the sheet header: `Approve day` / `Unapprove day` toggle (per-day approval scoped to the currently-viewed user; in the day-view list, each row has its own Approve toggle). Approved rows show a green "Approved" badge and disable inline edits until unapproved.

**Day view** table: `Employee | Project | Hours | Comments | Approved | Actions`. Same edit affordances inline.

## 4. My Timesheet (employee view) — `/my-timesheet`

New route `src/routes/_authenticated/my-timesheet.tsx`:

- Same Month/Range/Day view toggle.
- Read-only pivot / list showing only the current user's entries.
- Employee **can edit** entries on days where `approved_at IS NULL` (same editable drill-down as managers, restricted to self; RLS enforces this).
- Approved days render a lock icon + "Approved" badge and are read-only.
- Sidebar entry "My Timesheet" (visible to everyone, under Workspace).

## 5. Project Burn fix

Because per-day editing replaces the monthly-lump write, existing project-burn calculations already work day-by-day and will now stay in sync. No functional change needed to `project-burn.tsx` beyond what already exists — the source of the desync (Hours Editor lumping) is removed.

## Files touched

- `supabase/migrations/<timestamp>_timesheet_approval.sql` (new)
- `src/routes/_authenticated/route.tsx` (sidebar: drop Hours Editor, add My Timesheet)
- `src/routes/_authenticated/hours-editor.tsx` (delete)
- `src/routes/_authenticated/timesheet.tsx` (add view toggle, date range, editable drill-down, approval)
- `src/routes/_authenticated/my-timesheet.tsx` (new)
- `src/integrations/supabase/types.ts` (regenerated after migration)

No new server functions — all reads/writes go through `supabase` client with RLS enforcing the approval rules.
