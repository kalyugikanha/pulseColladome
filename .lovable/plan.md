## Goal

Make today's leave visible on two surfaces:

1. **HR → Leave management → Day view** — show approved + pending leave for the picked date, deduped per person (Hemanth's 6–7 July leave will appear).
2. **Attendance → Today** — show who's on approved leave today, and mark them as "On leave" instead of "Absent".

## Changes

### 1. HR Day view (`src/routes/_authenticated/hr.leave.tsx` → `DayView`)

- Restrict the query to visible statuses: `.in("status", ["approved", "pending"])` so cancelled/rejected rows don't inflate the counts.
- Dedupe by `user_id`: if a person has multiple overlapping rows (e.g. an earlier `pending` + later `approved`), keep the approved one.
- Sort cards inside each type by employee name.
- Header stays "On leave on {date}" with counts `total · approved · pending`.

### 2. Attendance Today (`src/routes/_authenticated/attendance.tsx` → `AttendancePage`)

- Extend the main `useQuery` to also fetch today's approved leaves for scoped users:
  ```
  supabase.from("leave_requests")
    .select("user_id, leave_type, start_date, end_date, reason")
    .eq("status", "approved")
    .lte("start_date", today).gte("end_date", today)
  ```
  (Scoped by `deptScope` / `userScope` via a follow-up in-memory filter using the already-fetched people list.)
- Build `onLeaveById = Map<user_id, leaveRow>`.
- In the Today card:
  - Add a top banner: "On leave today: {names, joined with •}" (hidden when empty).
  - For each row, if `onLeaveById.has(p.id)`, render a distinct **"On leave · {type}"** badge (amber) in place of Absent/Signed off. Punch info line is replaced with "On approved leave — {start}–{end}".
- Include `today` and a stable leave key in `queryKey` so it invalidates alongside attendance.

### 3. Cache invalidation

- `LogLeaveDialog.onSaved` already calls `qc.invalidateQueries()`, which will refresh both Day view and Attendance automatically after logging a leave.

## Out of scope

- Dashboard tile / calendar module — not requested; can be added later if needed.
