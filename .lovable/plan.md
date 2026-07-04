## Team Calendar — Business Enhancements

Enhance `/calendar` with people-first context so BD/managers can plan around the team at a glance.

### 1. Birthdays & Work Anniversaries
- Add two optional columns to `profiles`: `date_of_birth` (date) and `joined_on` (date).
- Surface an editable field on the Profile page (self-serve) and admin People page (HR-managed).
- On the calendar grid, render a small chip on matching month/day cells: 🎂 name (birthday) and 🎊 name · N yrs (anniversary). Month-day match ignores year so it repeats annually.

### 2. Meetings alongside leave
- Show meetings from the existing Meetings module on the same grid as compact chips (📅 title), color-tinted by kind (internal vs client).
- Query current month's meetings once and merge into the per-day render alongside leaves and holidays.
- If a user has connected Google Calendar, also overlay their own busy/meeting events (read-only) for the month.

### 3. Search / filter
- Add a toolbar above the grid:
  - Employee search (typeahead over `profiles.full_name`).
  - Department multi-select (from distinct `profiles.department`).
  - Type filters: Leave, Meetings, Birthdays, Anniversaries, Holidays.
- Filters affect which chips render; empty state per day when nothing matches.

### 4. Department colors
- Assign each department a stable color token (derived from a small palette mapped by department name hash, with admin-overridable mapping stored in a new `department_settings` table: `name`, `color`).
- Leave/meeting/birthday chips get a left border in the person's department color; legend shows department swatches.

### 5. Click a date for details
- Clicking a day opens a side sheet / dialog with three sections:
  - On leave today (name, type, status)
  - Meetings today (title, time, attendees count, kind)
  - Available today (everyone else, grouped by department, with a quick "Message" mailto)
  - Birthdays & anniversaries today
- Same sheet reused for holiday/weekly-off with the "Available" list suppressed.

### 6. Visual polish
- Keep dark surface (matches app theme) but lift day cells with a subtle surface tint and stronger today indicator so the grid reads less flat.

### Technical notes
- Migration: add `date_of_birth`, `joined_on` to `profiles`; create `department_settings(name pk, color text)` with `authenticated` read + admin write; GRANTs on both.
- New hooks: `useTeamMeetings(month)`, `useBirthdaysAnniversaries(month)`, `useDepartmentColors()`.
- New component: `DayDetailSheet` (shadcn `Sheet`), `CalendarFilters` (search + multi-select).
- Refactor `calendar.tsx` to compose filters + grid + sheet; grid cell becomes a small `DayCell` component to keep it readable.
- No changes to auth, RLS model beyond the two new tables/columns; leave query stays the same.

### Out of scope
- Editing meetings from the calendar (still done in Meetings page).
- Two-way Google Calendar sync (read-only overlay only).
