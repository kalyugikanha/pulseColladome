## Plan: Reset punch data + fix stale "Punch in" button

### Problem
Kanishka (production, incognito) clicks Punch In → gets error "already punched in", but:
- Punch page button still reads "Punch in" (not "Punch out")
- HR Attendance shows her as not punched in

Root cause: her `punch_sessions` today has an open row the client didn't see (query cache empty on fresh incognito load returned stale/empty result, or the insert failed the unique-index guard from the recent migration but UI never refetched). Meanwhile `attendance_logs` for today was never rolled up for her, so HR reads "not punched in".

### Fix

1. **Wipe all punch/attendance data (fresh start for deployment)**
   Single migration that deletes:
   - `DELETE FROM public.punch_sessions;`
   - `DELETE FROM public.attendance_logs;`
   
   This gives everyone a clean slate today. No schema changes.

2. **Harden punch page against the stale-state loop**
   In `src/routes/_authenticated/punch.tsx`:
   - On mount and on window focus, force-refetch `punch-sessions-today` so a fresh tab immediately sees any existing open session.
   - If `punchIn()` insert fails with the unique-violation error (open session already exists), auto-refetch sessions and show "You already have an open session" instead of leaving the button stuck.
   - Same treatment on Dashboard's punch-in handler.

3. **Verification**
   After deploy, confirm both tables are empty via read query, then have a test user punch in/out and confirm dashboard + HR attendance + punch page all agree.

### Technical details
- Migration file with two `DELETE` statements (no truncate, to preserve any FK behavior; tables have no children referencing them for punch data).
- Frontend edits limited to `punch.tsx` and `dashboard.tsx` — add `refetchOnMount: "always"`, `refetchOnWindowFocus: true` to the punch session query, and error-code handling in the insert path.
