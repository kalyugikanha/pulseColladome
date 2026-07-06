## Insert June 30, 2026 time entries for 3 employees

Add timesheet entries on **2026-06-30** via `attendance_logs` so unallocated salaries in Finances become project-coded.

### Entries

**Chirag Bansal** (`79b55659…`) — new row
- CLDM00567 · Colladome Business Development — 200 h
- total_hours: 200

**HEMANTH SRIDHAR** (`f83d4464…`) — new row
- CLDM00000 · Colladome Social Media — 120 h
- total_hours: 120

**Shraddha Saxena** (`6dd230de…`) — existing empty row (`tasks: []`, 0 h) → update
- CLDM00565 · Colladome Documentation — 50 h
- CLDM00101 · Colladome Internal Coordination & Management — 50 h
- CLDM00104 · Colladome RA — 50 h
- CLDM00568 · Colladome Hiring — 50 h
- total_hours: 200

### Method

Single SQL migration:
- `INSERT` new `attendance_logs` rows for Chirag and Hemanth (date `2026-06-30`, `tasks` JSONB with `project_code`, `project_name`, `hours`).
- `UPDATE` Shraddha's existing 2026-06-30 row, setting `tasks` and `total_hours`.

Note: 200h and 120h on a single calendar day are unrealistic, but these look like month-aggregate backfills posted on the last day of June to trace unallocated salary in the Finances view. Confirm if instead you want these split across the month.
