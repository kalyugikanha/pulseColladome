## Goal

Lock signups to `@colladome.com` / `@colladome.in` via Google SSO only, and stop creating duplicate profiles when someone in the roster signs in for the first time — instead, merge onto the pre-seeded row keyed by email.

## 1. Restrict sign-in to Colladome Google accounts

**Frontend (`src/routes/auth.tsx`)**
- Remove email/password sign-up UI. Keep only "Continue with Google".
- Sign-in email/password stays only if you want a fallback for existing legacy accounts — otherwise remove too. (Default: remove.)
- Call `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin, extraParams: { hd: "*", prompt: "select_account" } })` so Google hides personal Gmail accounts in the picker.

**Backend enforcement (authoritative — `hd` alone is not enough)**
- Update `handle_new_user` trigger: if `lower(split_part(NEW.email,'@',2))` is not in (`colladome.com`, `colladome.in`), `RAISE EXCEPTION` — aborts the auth insert, so no profile/role rows are created and the user gets an error instead of an account.
- Add same check in a `BEFORE UPDATE OF email` trigger on `auth.users` to block email changes to outside domains.
- Disable email/password provider via `configure_auth` (keep Google only).
- Ensure `configure_social_auth` has Google enabled (already done).

## 2. Email as the merge key (no more duplicates)

**Schema change — `role_grants` becomes the pre-seed table keyed by email**
- Add column `reporting_manager_email text` to `role_grants`.
- Add unique index on `lower(email)`.

**Rewrite `handle_new_user` merge logic**
When a new `auth.users` row appears:
1. Normalize `em := lower(NEW.email)`.
2. Look up `role_grants` by `lower(email) = em`. This row carries department, default salary, super-admin flag, role, and now `reporting_manager_email`.
3. Look up any **existing placeholder profile** by `lower(email) = em` where `id` does not correspond to an `auth.users` row (orphan seeded before signup).
   - If found: **update that profile's `id` to `NEW.id`** (single `UPDATE profiles SET id = NEW.id, avatar_url = COALESCE(...), must_change_password = false WHERE id = <orphan_id>`), then let cascading FKs follow. If FK cascades don't cover a table (e.g. `leave_balances`, `salaries`, `user_roles`), re-point them explicitly in the same trigger.
   - If not found: `INSERT` a fresh profile as today.
4. Resolve `reporting_manager_id`: `SELECT id FROM profiles WHERE lower(email) = lower(role_grants.reporting_manager_email)`. Store on the profile. If manager hasn't signed in yet, leave null.
5. After merging, run a **back-link pass**: `UPDATE profiles SET reporting_manager_id = NEW.id WHERE lower(reporting_manager_email_pending) = em` so people who signed in before their manager get linked when the manager arrives. (Requires storing `reporting_manager_email` on `profiles` too — add column.)

**Backfill migration (one-time)**
- Populate `role_grants.reporting_manager_email` for the current roster (Kanishka → shubham@colladome.in, plus any others you provide). For now: only Kanishka → Shubham.
- Merge existing duplicates: for each `(colladome.com, colladome.in)` pair or `(gmail.com, colladome.*)` pair with the same person, keep the `@colladome.*` row, re-point FKs, delete the other profile.
- Delete orphaned placeholder profile rows whose `id` has no matching `auth.users` AND whose email now belongs to a merged profile.
- Purge any existing non-Colladome `auth.users` (Gmail, etc.) — this signs them out permanently. Confirm before running.

## 3. UI follow-ups

- Directory: show `reporting_manager` name resolved from `reporting_manager_id`.
- Onboarding admin form: when adding a future employee, write to `role_grants` (email + department + reporting_manager_email + role) instead of creating a placeholder `profiles` row. Profile materializes automatically on first Google sign-in.

## Open confirmations before I build

1. Remove email/password entirely (sign-up **and** sign-in), Google-only? Default: yes.
2. Purge existing non-Colladome auth users (e.g. `kathatsandhya07@gmail.com`)? Default: yes.
3. Only reporting-manager mapping right now is **Kanishka → Shubham** — correct? Others added later via Directory.

## Technical notes

- `auth.users` triggers can `RAISE EXCEPTION` to block signup; error surfaces to the client as a Supabase auth error.
- Updating `profiles.id` requires FKs on dependent tables to be `ON UPDATE CASCADE`, or explicit re-pointing in the trigger. Migration will audit `leave_balances`, `salaries`, `user_roles`, `tasks`, `punch_sessions`, `attendance_logs`, `employee_bank_details`, `employee_documents`, `leave_requests`, `super_admins` and re-point in one transaction.
- `hd:"*"` restricts Google's account chooser to Workspace accounts but is bypassable — the DB trigger is the real gate.
