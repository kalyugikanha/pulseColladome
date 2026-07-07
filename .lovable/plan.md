
## Business Development module

A completely new module, independent from Marketing tasks. New tables, new routes, new UI. Marketing task table, forms, and workflow are untouched.

## Data model (new tables, `bd_` prefix)

1. **bd_activity_types** — lookup list
   - `name` (text, unique), `sort_order`, `is_active`
   - Seeded with: Inbound Follow-up, CRM Update, Client Call, Client Meeting, Outreach / Prospecting, Tool / Account Setup, Tracker / Admin, Other
   - Admin-editable (add/rename/deactivate)

2. **bd_recurring_items** — templates
   - `title`, `assignee_id` (→ profiles), `activity_type_id`
   - `frequency` enum (`daily` | `weekly`)
   - `weekdays` int[] (0–6, used when weekly)
   - `is_active` bool
   - `created_by`, timestamps

3. **bd_activity_logs** — daily entries (core table)
   - `log_date` (date), `user_id` (→ profiles), `activity_type_id`
   - `recurring_item_id` (nullable — null = ad-hoc)
   - `description` (text, one-liner)
   - `hours_spent` numeric(5,2)
   - `status` enum (`pending` | `done` | `carried_forward`)
   - `carried_forward_to` date (nullable — set when rolled to next day)
   - `media_url` text (optional — Supabase Storage bucket `bd-activity-proof`)
   - Unique `(user_id, log_date, recurring_item_id)` where recurring_item_id NOT NULL (prevents double auto-gen)

4. **Reuse**: team members = existing `profiles` + `user_roles`. No new roles table.

RLS:
- Users select/insert/update their own `bd_activity_logs` only.
- Admins (super admin, or new `bd_admin` capability — reuse `has_role` with existing `admin` role) can see everything and manage recurring items & activity types.
- Recurring items: user can read items assigned to them; admin manages all.

## Auto-generation of daily rows

Approach: **lazy generation on first view of a given date**, not a cron.

- Server function `ensureDailyBdLog(date, userId)`:
  - Finds all `bd_recurring_items` where `is_active` AND assignee_id = userId AND applies to that date (daily always; weekly if weekday matches).
  - For each, upserts a `bd_activity_logs` row with `status='pending'`, `hours_spent=null`, `description=''`.
- Called by the "My BD Day" page on load and by admin views when opening someone's day.
- Idempotent thanks to the unique constraint.

Carry-forward:
- End-of-day (or manual) "Roll pending to tomorrow" action: for each pending row on date D, insert a fresh row for D+1 linked to the same recurring item, mark original as `carried_forward` with `carried_forward_to = D+1`.

## UI / routes

New nav item **"Business Development"** in the sidebar (all authenticated users see the daily view; admin section shows recurring items + reports).

Routes under `src/routes/_authenticated/bd/`:

- `bd/index.tsx` — **My BD Day**
  - Date picker (defaults today)
  - Auto-generated recurring items list: each row = title + activity type badge + Hours input + Description input + Done checkbox + optional attach-media button
  - "+ Add extra activity" opens inline mini-form: activity type dropdown, description, hours, optional media
  - Footer button: "Roll pending to tomorrow"
  - Single scrollable page, no wizard

- `bd/recurring.tsx` — **Recurring items** (admin only)
  - CRUD table: title, assignee, activity type, frequency (+ weekday chips), active toggle

- `bd/activity-types.tsx` — **Activity types** (admin only)
  - Simple list editor

- `bd/reports.tsx` — **Reports** (admin only)
  - Filters: date range presets (this week, last week, custom), team-member multiselect, activity-type multiselect
  - Bar chart: hours by activity type, grouped per team member (recharts, already in stack)
  - Summary table: totals by member × activity type
  - "Export CSV" button (client-side blob)

Access wiring in sidebar (`src/routes/_authenticated/route.tsx`): add "Business Development" under Workspace for everyone; "BD Recurring", "BD Activity Types", "BD Reports" under Admin section, gated on `isAdmin || isSuperAdmin`.

## Technical notes

- All DB writes/reads via `createServerFn` in `src/lib/bd.functions.ts` using `requireSupabaseAuth`. Admin-only fns check `has_role(userId, 'admin')` or `isSuperAdmin`.
- Media upload → new Supabase Storage bucket `bd-activity-proof` (private, RLS: owner read/write, admin read).
- Charts: `recharts` (already present).
- CSV export: build in-memory, `Blob` + download link — no server round-trip.
- No changes to any `tasks*` table, marketing task components, or task workflow code.

## Migration order

1. Create enums, tables, GRANTs, RLS policies, seed activity types, storage bucket + policies.
2. Add server functions (`src/lib/bd.functions.ts`).
3. Add routes + sidebar entries.
4. Verify: build, then smoke-test daily view (auto-gen, carry-forward) and reports.

## Open questions before build

1. Should the **admin** role for BD reuse existing `admin` / super admin, or do you want a dedicated `bd_admin` role in `user_roles`? (Default: reuse existing `admin` + super admin.)
2. Media attachment — one file per log entry, or multiple? (Default: one image/PDF up to ~10 MB.)
3. Carry-forward: automatic at midnight, or manual button only? (Default: manual button on the day view — no cron.)
