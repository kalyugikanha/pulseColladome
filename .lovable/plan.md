## Fix: Leave request FK error for placeholder profiles

Some active profiles (Anjali, Trisha, Deepak, Juhi, Manvi, Neetu) exist in `public.profiles` but have no matching `auth.users` row. Inserting a leave request for them fails the `leave_requests_user_id_fkey` FK.

### Changes

1. **New server function** `syncMissingAuthAccounts` in `src/lib/admin-users.functions.ts`
   - Gated by super-admin check (`requireSupabaseAuth` + `has_role`/`super_admins`).
   - Loads active profiles missing an `auth.users` row.
   - For each: calls `supabaseAdmin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name } })`.
   - The existing `handle_new_user` trigger re-points FK-referenced rows (attendance_logs, leave_requests, tasks, salaries, etc.) from the placeholder profile id to the new auth id and deletes the placeholder.
   - Returns `{ synced, alreadyOk, errors[] }`.

2. **UI on `/access`** (admin/access page)
   - Add a "Sync missing accounts" button next to the existing "Run provisioning" button.
   - Reuse the same result panel format to show synced count and per-email errors.

### Out of scope
- Changing the `leave_requests.user_id` FK target.
- Blocking the leave dialog client-side.
- Any change to non-Colladome domain handling (trigger already enforces).
