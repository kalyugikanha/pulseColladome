## Seed June-30 punch sessions

Each row becomes a closed `punch_sessions` entry on **2026-06-30**, with times stacked sequentially per employee (09:00 IST + running total) so `hours` sums correctly and the AFTER-INSERT trigger fills `attendance_logs`.

### Name → profile mapping

| Sheet name | Profile |
| --- | --- |
| Kanishka | Kanishka Khunteta |
| Deepak | Deepak Patel |
| Sandeep | Sandeep Kumar Mandal |
| Sharaddha | Shraddha Saxena |
| Arti | Arti Kumawat |
| Akash | Akash Jangid |
| Sweksha | Sweksha Jadon |
| Jagjeet | Jagjeet Singh Jassal |
| Chirag | Chirag Bansal |
| Juhi | Juhi Nagar |
| Anjali | Anjali |
| Neetu | Neetu Rauniyar |
| Sridhar Hemanth | Addala Hemanth Sridhar |
| Manvi | Manvi Bansal |
| Trisha | Trisha Panday |

### Filters

- Rows with `hours = 0` are skipped (Kanishka×CLDM00521, Kanishka×CLDM00564, Deepak×CLDM00563, Anjali×CLDM00563).
- **Deepak Patel and Sweksha Jadon are placeholder profiles** (haven't signed in yet). `punch_sessions.user_id` FKs to `auth.users`, so their rows will be rejected. Those 8 rows (Deepak: 5 non-zero, Sweksha: 2) will be **skipped and reported back**. Reseed after they log in.

### Method

Single SQL with a `VALUES` CTE → join to `profiles` (by first-name match, `is_placeholder=false`) + `projects` (by `code`) → `INSERT INTO punch_sessions` with per-user running-window timestamps and an `allocations` JSON of one item mirroring the punch.

The existing `handle_punch_session_attendance_sync` trigger will populate `attendance_logs` for 2026-06-30 automatically.

### Verify

Query total hours per employee for 2026-06-30 after insert and compare with the sheet.

### Note

Some totals are large (Akash ≈ 310h, Chirag/Juhi 200h) — impossible in one calendar day, but I'll seed exactly as you specified since this is for a monthly finance snapshot dated 30-Jun.
