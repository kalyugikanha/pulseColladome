## Changes

### 1. "View as" dropdown shows all employees (including pending signups)
In `src/components/top-bar.tsx`, also query `role_grants` and merge with `profiles`:
- Signed-up users → use their profile id (works as today, switches session context).
- Pending invitees (in `role_grants` but no matching profile by email) → show in the list, disabled/greyed with a "Pending signup" badge and not selectable (nothing to switch into — no user id exists yet).
Sort combined list by name/email.

### 2. Saturday rotation + Sunday as weekly off
In `src/hooks/use-holidays.ts`, add helpers:
- `isSundayOff(date)` → Sundays are always holidays.
- `isSaturdayOff(date)` → 2nd and 4th Saturdays of the month are off; 1st, 3rd, 5th are working.
- `isWeeklyOff(date)` → combines the two.
- Update `nextHoliday(list)` to return the nearest of: next seeded holiday, next Sunday, or next off-Saturday — with a synthetic `{ name: "Sunday" | "2nd Saturday" | "4th Saturday" }` entry when the weekly off wins.

Also mark weekly-off days on the team calendar in `src/routes/_authenticated/calendar.tsx` using the same helper (subtle styling, alongside the seeded holidays already shown).

### 3. Top bar next-holiday chip
No structural change — it already reads `nextHoliday(holidays)`. With the helper update above, it will now automatically surface Sunday / 2nd- or 4th-Saturday when those are closer than the next seeded public holiday.

## Not doing
- No schema/migration changes — Saturday rotation is derived from the date, not stored.
- No changes to leave-balance math (weekly offs already aren't counted as leave days).

## Files touched
- `src/hooks/use-holidays.ts` — add weekly-off helpers, extend `nextHoliday`.
- `src/components/top-bar.tsx` — merge `role_grants` into the View-as list; render pending rows disabled.
- `src/routes/_authenticated/calendar.tsx` — mark Sundays and 2nd/4th Saturdays as off.
