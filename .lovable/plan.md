## Goal

1. Let a super admin edit hours logged per user × project for any month.
2. Mock June 2026 hours for every person in your table (including those who don't have accounts yet), so we can visually test the burn/finance views.

## Schema changes (migration)

Because most names in your table (Kanishka, Deepak, Sharaddha, Akash, Sweksha, Chirag, Juhi, Anjali, Neetu, Sridhar, Manvi, Trisha, Sandhya, Shaleen) don't have logins yet, `attendance_logs.user_id → auth.users` and `profiles.id → auth.users` block us from inserting placeholder people.

- Drop the FK `profiles.id → auth.users` (keep the column and PK).
- Drop the FK `attendance_logs.user_id → auth.users` and re-point it to `profiles(id) ON DELETE CASCADE`.
- Add a nullable column `profiles.department text` so the department (Marketing / Designer / Admin / Finance / Business Development / Project Manager / Video Editor) shows on the grid.
- Add a helper column `profiles.is_placeholder boolean default false` so we can clearly identify seeded no-login accounts and wipe them later when you move to production.
- `handle_new_user` still creates profiles with real auth ids — unchanged behavior for real signups.

## Seed data (migration, same file)

- Insert profile rows for the 14 missing people with fresh UUIDs, `is_placeholder=true`, and the departments from your table.
- For every user × project pair in the June column, upsert one `attendance_logs` row dated `2026-06-01` per user, and append a `{project_code, project_name, hours}` object into `tasks` for each of their June projects. `total_hours` = sum of that user's June hours. This slots straight into what the Project Burn / finance views already read.
- Projects that don't exist yet (I checked — everything in the table already has a matching `projects.code`) — nothing to seed there.

**Note on the "May" rows** you pasted: I'm ignoring May because you asked for "just June". Say the word and I'll seed May and April the same way.

## Super-admin hours editor (frontend only)

New page `/hours-editor` (sidebar link under Admin, super-admin only, icon: Clock).

Layout:
- Month picker at the top (defaults to current month).
- A table: rows = users (grouped/sorted by department), columns = projects that have any hours that month + a trailing "+ Add project" per row.
- Each cell is an inline number input; blur or Enter saves. Empty cell = 0.
- Save writes back to that user's `attendance_logs` row for the 1st of the selected month: creates the row if missing, updates the matching entry inside `tasks` jsonb, and recomputes `total_hours`.
- Read/write is direct Supabase from the browser under existing RLS; I'll add a super-admin-only `UPDATE`/`INSERT` policy on `attendance_logs` so super admins can edit anyone's row (current policies only allow the owner).

RLS additions:
- `attendance_logs`: super admins can `SELECT`, `INSERT`, `UPDATE`, `DELETE` any row (`is_super_admin(auth.uid())`).
- `profiles`: super admins can `INSERT`/`UPDATE`/`DELETE` any profile (to keep the placeholder rows manageable from the app later if you want).

## Production cleanup path (documented, not built yet)

When you say "we're moving to production", the cleanup will be a single migration:
```
DELETE FROM attendance_logs WHERE date < '2026-07-01';
DELETE FROM tasks;   -- if you also want to wipe seeded tasks
DELETE FROM profiles WHERE is_placeholder = true;
```
(July hours preserved because they'll be dated ≥ 2026-07-01.)

## Files touched

- New migration: schema changes + June seed.
- New route: `src/routes/_authenticated/hours-editor.tsx`.
- Edit: `src/routes/_authenticated/route.tsx` — sidebar link (super admins only).
- Edit: `src/integrations/supabase/types.ts` regenerates automatically after the migration.

No changes to Project Burn / Finances / Punch pages; they'll pick up the seeded hours automatically.