## Goal

Give super admins and managers a dead-simple, date-selectable attendance overview inside the existing `/attendance` page — no new tables, no schema changes.

## Where it goes

Add a third tab **"Overview"** to `src/routes/_authenticated/attendance.tsx` alongside the existing "Today" and "Leave" tabs. Default landing tab for admins/managers becomes **Overview**; regular scope logic (`deptScope` / `userScope`) is reused so managers only see their reports and admins see everyone.

## UI

**Date picker** (shadcn DatePicker, `pointer-events-auto`) at the top — defaults to today, any past date allowed, future dates disabled.

**Summary cards** (4 cards, bullet-style, responsive grid) for the selected date:
- 👥 **Total employees** — count of active profiles in scope
- 🌴 **On leave** — count with an approved leave covering that date
- ✅ **Punched in** — count with an `attendance_logs` row (punch_in_time set) for that date
- ❌ **Not punched in** — total − on-leave − punched-in

Each card shows the number + a one-line caption (e.g. "3 of 24 employees").

**Employee table** below the cards:

| Employee | Department | Status | Punch in | Punch out | Hours |

Status badge: `On leave (type)` · `Punched in` · `Punched out` · `Absent`. Rows sortable by status (leave → absent → in → out) so gaps surface first. A search box filters by name. Empty punch-out shows "—".

**Export**: small "Export CSV" button (client-side, same columns as the table) for the selected date.

## Data (all client-side supabase reads, matches existing pattern)

One React Query keyed by `["attendance-overview", date, scope]`:
- `profiles` in scope where `is_active = true` (name, department, id)
- `attendance_logs` where `date = <selected>` and `user_id in scope`
- `leave_requests` where `status = 'approved'` and `start_date <= <selected> <= end_date` and `user_id in scope`

Join in-memory to build the rows and card counts. No new server functions, no migration.

## Access

- Regular employees: Overview tab hidden (they keep seeing Today + Leave as today).
- Managers: see only their reporting scope (reuse existing `deptScope` / `userScope`).
- Admins / super admins: see everyone.

## Files touched

- `src/routes/_authenticated/attendance.tsx` — add Overview tab, date state, query, cards, table, CSV export. No other files.
