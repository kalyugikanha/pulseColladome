## Root cause

`DayView` fires its Supabase query without waiting for `useCurrentUser` to resolve — every other query on the HR Leave page uses `enabled: !!me`, but this one doesn't. When Shraddha lands on `/hr/leave`, the day-view query can run before the Supabase auth session/JWT is attached; RLS then treats the call as anonymous, returns 0 rows, and the query result is cached as empty. Sibling queries (`hr-leave-month`, `hr-leave-requests-all`) don't hit this because they're gated on `!!me`.

Confirmed: the row (`b8c58883…`, approved, 6–7 July, Hemanth) exists and RLS permits `hr_admin` to read it.

## Fix

`src/routes/_authenticated/hr.leave.tsx` → `DayView`:

- Call `useCurrentUser()` inside `DayView`.
- Add `enabled: !!me` to the day query and include `me?.id` in `queryKey` so it refetches once auth is ready.
- Show a small "Loading…" placeholder in the card body while `!me || !data`.

No other changes — the underlying create/approve/deduct flow works and the row is already in the DB.
