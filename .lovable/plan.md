## Goal
Seed June 2026 `attendance_logs` rows from the pasted list so the Timesheet / Project Burn pages show these hours.

## Name → profile mapping (trust code, skip blanks)
| Pasted | Profile |
|---|---|
| Kanishka | Kanishka Khunteta |
| Deepak | Deepak |
| Sandeep | sandeep |
| Shraddha | Sharaddha |
| Arti | Arti Kumawat Colladome |
| Akash | Aakash |
| Sweksha, Jagjeet, Chirag, Juhi, Anjali, Neetu, Sridhar (→ Sridhar Hemanth), Manvi, Trisha | exact match |
| Sandhya, Trisha's blank row, Kanishka RR Pay/Eartheon blanks, Deepak Outfitq blank, Anjali Outfitq blank | **skipped** |

Project codes used verbatim from the pasted data (e.g. `CLDM00527` stays "Growinsight (Phase 2)", `CLDM00481` stays "Briskon Technologies", `CLDM00103` stays "Outfitq"), matching the earlier "trust code" decision.

## Rows to insert (54 entries after skips)

For each (employee, project, hours) entry:
- Create one `attendance_logs` row on a distinct **June 2026 weekday** per employee, starting Mon Jun 1 and walking forward across weekdays (skipping Sat/Sun). Each employee's entries land on consecutive weekdays — no two entries share a date, so the `(user_id, date)` unique constraint is safe.
- Row shape:
  - `user_id` = mapped profile id
  - `date` = assigned weekday in June 2026
  - `punch_in_time` = `date 10:00 IST`, `punch_out_time` = punch_in + hours
  - `total_hours` = hours
  - `tasks` = `[{ project_id, project_code, project_name, hours, comments: "June work" }]`
  - `daily_note` = `"Seeded June entry"`
- Insert via `ON CONFLICT (user_id, date) DO NOTHING` so re-runs and any existing rows are preserved untouched.

Largest per-employee entry count is Akash's 13, well within June's 22 weekdays.

## Delivery
Single `supabase--insert` call containing all 54 INSERTs, wrapped in a `WITH proj AS (SELECT id, code FROM projects)` CTE so project_ids are looked up by code (no hard-coded UUIDs).

## Not doing
- No schema changes.
- No touching pre-existing attendance rows.
- No entries for Sandhya or any blank-hours row.
