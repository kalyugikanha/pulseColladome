## Team Calendar — enhancements

### 1. Date navigation
- Add a date picker (shadcn `Calendar` in `Popover`) next to the Month prev/next controls. Selecting a date sets `cursor` and opens that day's detail sheet.
- Add a "Today" button for quick reset.
- Keep month grid as-is.

### 2. Employee selector (multi-select dropdown)
- Add an "Employees" `Popover` next to the existing search input, showing a scrollable checkbox list of all `visibleProfiles` (with search-in-list).
- Selected user IDs become a `Set<string>` filter; `matchesFilters` uses it (in addition to the free-text search and department filters).
- Show selected count as a badge; "Clear" resets.
- Free-text search stays; new dropdown is complementary.

### 3. Cross-user visibility
- Already unrestricted server-side (`listTeamCalendarEvents` uses admin client and returns all profiles + events/bookings). No changes needed; confirm private events still show as "Busy".

### 4. Smart Book Time flow
Rework `BookingDialog` into a 3-step flow:

1. **Attendees** — Multi-select from directory (same dropdown component as filter). Optional: allow adding external emails as chips.
2. **Time window** — Pick a date (default today), duration (15 / 30 / 45 / 60 / 90 min), and working-hours range (default 09:00–19:00 local).
3. **Suggested slots** — Compute mutually-free slots by:
   - Server fn `findAvailableSlots({ userIds, dateISO, durationMin, windowStart, windowEnd })` (new) that queries `google_calendar_events` + `team_calendar_bookings` + approved `leave_requests` for all selected users on that date, merges busy intervals, and returns free slots ≥ duration.
   - Client renders slots as clickable chips. On click, populate start/end and show "Confirm booking" (title + description + optional location) → calls existing `createTeamCalendarBooking` with attendee emails resolved from selected user IDs.
   - Manual override: "Pick custom time" reveals the existing datetime-local inputs.

### Technical notes
- New server fn added to `src/lib/google-calendar.functions.ts` reading via `supabaseAdmin` (no user restriction — matches current openness). Returns `{ busy: Interval[], free: Interval[] }`.
- Slot computation: sort busy intervals, merge overlaps, walk the working window in `durationMin` steps (or gap-based) to emit free slots.
- All-day events / full-day leaves block the entire working window for that user.
- Reuse existing shadcn `Calendar`, `Popover`, `Checkbox`, `Command` (for searchable multi-select).
- No schema/RLS changes; no changes to auth or existing sync logic.

### Files
- `src/routes/_authenticated/calendar.tsx` — date picker, Today button, employee multi-select dropdown, rewritten `BookingDialog`.
- `src/lib/google-calendar.functions.ts` — new `findAvailableSlots` server fn.
- `src/components/ui/*` — add `command.tsx` / `checkbox.tsx` only if missing.
