## Consolidate all remaining June bulk rows into June 30

Sweep every attendance row in June 2026 (except those already on June 30) into a single approved June-30 rollup per employee. Same logic as the previous fix, just widened to cover the whole month.

### Data migration (via `supabase--insert`)

1. Merge the `tasks` JSON arrays from every `attendance_logs` row where `date` is in `[2026-06-01, 2026-06-30)` into the existing June 30 row for the same `user_id`. If a user has no June 30 row yet, insert one (unauthenticated data operation, so `approved_by` stays NULL; `approved_at = now()` still locks it in the UI).
2. Delete the pre-June-30 rows once merged.
3. Mark the resulting June 30 rows approved (`approved_at = now()`).

### Expected result
- Project Burn shows no June activity on any day except June 30.
- June 30 totals equal the sum of every previous June row per employee.
- Rows are approved so employees can't edit them from My Timesheet.

No code changes and no schema changes.
