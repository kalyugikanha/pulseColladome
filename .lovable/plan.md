## Cleanup plan (data-only)

### 1. Rename Sandhya to her official email

- `…0013` → `email = sandhya@colladome.in`, `is_placeholder = false`, salary 0 (no salary row needed — she's already excluded from burn).

### 2. Remove Shaleen entirely (no longer with the company)

- Delete his `attendance_logs`, `leave_balances`, `leave_requests`, `punch_sessions`, `salaries`, `user_roles`, `super_admins` rows for id `…0014`.
- Delete his `profiles` row.
- His June hours (Oswal 60h + Outfitq 30h) go away with him.

### 3. Treat all remaining placeholder profiles as "signed up"

After steps 1–2, no `@placeholder.colladome.local` addresses remain. All twelve renamed placeholders (…0002, 0003, 0005–0012, plus 0013 now) already have `is_placeholder = false` from the previous migration, so the UI shows them as regular team members. No auth account is created yet — they show as fully provisioned people whose sheets, salaries, and burn are tracked under their official emails.

### 4. Later, when you say "moving to production"

At that point I'll run — for every placeholder id (`11111111‑…0002/0003/0005‑0013`):
1. Create the auth user with the official email + temp password `Test@123`, `email_confirm = true`, `must_change_password = true`.
2. Re‑point all data (attendance, salaries, leave, punch, roles) from the placeholder id to the new real auth id.
3. Delete the placeholder profile.

That way first sign-in forces `/change-password` before entering the app, and every historical June/July row keeps their name. This is the same `createTeamUser` flow already wired for Akash — I'll just batch it. **Do NOT do this until you say the word.**

## Technical

Single migration:
- `DELETE` cascade for Shaleen across the six user-scoped tables + `profiles`.
- `UPDATE profiles SET email='sandhya@colladome.in', is_placeholder=false WHERE id='…0013'`.
- Nothing else — no schema changes, no code changes.
