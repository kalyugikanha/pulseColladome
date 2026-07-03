## Delete user — Sweksha Jadon (`sweksha.colladome@gmail.com`)

Auth user id: `97151baf-852f-4dd0-93e7-2c74c604dda4`.

### Steps
1. **Delete from `auth.users`** via a one-off server call using `supabaseAdmin.auth.admin.deleteUser(id)`. This cascades to `profiles`, `user_roles`, `super_admins`, `leave_balances`, `leave_requests`, `salaries`, `punch_sessions`, `attendance_logs` — every table has `ON DELETE CASCADE` from the `auth.users` FK.
2. **No changes to `role_grants`** — she already has no invite row (the only alias was `sweksha.colladome@gmail.com` and I removed it in the last turn; `sweksha@colladome.in` remains for the intended employee).

I'll trigger the delete by invoking the existing admin server function path — easiest is to add a tiny one-shot `deleteUser` server function scoped to super admin, or run it via a temporary migration using the auth admin API isn't possible from SQL. So: add `deleteUserById` server fn (super-admin only), call it once with her id from a shell/dev call, then leave the function in place for future use.

Actually simpler for this one-off: run it through the existing invoke-server-function tool right after adding the function. The function stays available for future super-admin use.

### Files touched
- `src/lib/admin-users.functions.ts` — add `deleteUserById` (super-admin gated).

### Not doing
- No UI button this turn; just the server capability + the one-shot invocation for Sweksha.
- No changes to the `sweksha@colladome.in` invite.
