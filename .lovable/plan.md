## Two fixes

### 1. Timesheet visibility for reporting managers

Right now the Timesheet page grants access to anyone who is a reporting manager (correct), but does not scope the profile list to their direct reports. Kanishka (plain employee, but reporting manager for 6 people) therefore sees the full employee list. RLS blocks other people's logs, but her own entries still leak into her view and the UI shows unrelated names.

Fix in `src/routes/_authenticated/timesheet.tsx`:
- Build `allowedUserIds` based on role:
  - Admin / project manager → all users.
  - Department head → users in `headOfDepartments`.
  - Reporting manager (only) → `directReportIds` **plus** herself.
- Apply that filter to:
  - the `profiles` query (`.in("id", allowedUserIds)`),
  - the `attendance_logs` query (`.in("user_id", allowedUserIds)`),
  - the derived `users` / `filteredUsers` lists.
- Same scoping applied to the Day-view rows and CSV export so a reporting manager only ever sees her own + reportee data.

No change to `my-timesheet.tsx` (already self-scoped) and no change to RLS.

### 2. Consolidate old bulk-uploaded June hours

The June-1 rows in `attendance_logs` are the leftover lumps from the retired monthly editor (12 rows totalling 2195 hrs). Real per-day entries also exist for June 2–17. Project Burn now sums both, so June is double-counted with a huge day-1 spike.

Data-only change via the insert tool (single SQL migration of data, not schema):
- For every `attendance_logs` row where `date = '2026-06-01'`:
  - Update `date` to `'2026-06-30'`.
  - Set `approved_at = now()`, `approved_by = user_id` (self-approval marker; column is nullable and we just need a non-null value to lock it), `last_edited_by = user_id`.
- If a user already has a June 30 row, merge: concatenate the `tasks` JSON arrays into the existing row and delete the June 1 row (handled with an upsert/merge CTE).
- Leave June 2–17 rows and the sparse July rows untouched.

Result: the day-1 spike disappears, the bulk totals live as a single approved rollup on June 30, and Project Burn stops double-counting.

### Files touched
- `src/routes/_authenticated/timesheet.tsx` — scope by reportees.
- Data migration via `supabase--insert` — move/merge June-1 rows to June 30 and mark approved.

No schema changes, no other route changes.
