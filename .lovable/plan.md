## Provision pending users (super-admin action)

Sweksha (and every other invitee still in `role_grants` without a `profiles` row) has no auth account, so there's nothing to view. Add a super-admin action that creates real accounts for all pending invitees.

### Server function: `provisionPendingUsers`
New file `src/lib/admin-users.functions.ts`:
- `createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(...)`
- Verify caller: `context.supabase.rpc('is_super_admin', { _user_id: context.userId })` → throw 403 if not.
- Dynamically `await import('@/integrations/supabase/client.server')` to get `supabaseAdmin`.
- Query `role_grants`; for each row whose email has no matching `profiles.email` (case-insensitive):
  - `supabaseAdmin.auth.admin.createUser({ email, password: "Test@123", email_confirm: true, user_metadata: { full_name: <derived from email local-part> } })`.
  - The existing `handle_new_user` trigger already creates the profile, applies the role from `role_grants`, seeds salary from `default_monthly_salary`, and sets `must_change_password = true` — no extra writes needed.
- Return `{ created: string[], skipped: string[], errors: {email, message}[] }`.

### UI: "Provision pending users" button on `/finances`
In `src/routes/_authenticated/finances.tsx` header (super-admin only):
- Button with `useMutation` calling `useServerFn(provisionPendingUsers)`.
- Toast summarizing counts; invalidate `["viewas-profiles"]`, `["profiles-with-salaries"]`, `["viewas-grants"]`, and the finances profile query so the new users appear immediately.
- Disabled while pending; shows spinner.

### After it runs
- Sweksha (and everyone else pending) becomes selectable in the View-as dropdown.
- Their salaries appear in Finances (already seeded by trigger from `role_grants.default_monthly_salary`).
- On their first real sign-in with `Test@123`, the existing forced password-change flow kicks in.

### Files touched
- `src/lib/admin-users.functions.ts` — new
- `src/routes/_authenticated/finances.tsx` — add button + mutation

No schema changes. No changes to auth config.
