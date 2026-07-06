## Problem

Anjali's profile (`anjali@colladome.in`) has no matching `auth.users` row. The server function tries `supabaseAdmin.auth.admin.createUser(...)` for her, that call fails, and the client shows `This employee account is not synced yet: {}` — the underlying error object serializes to `{}` because we only read `.message`, which is empty on some Auth admin errors (typically "Database error creating new user" triggered by `handle_new_user`).

Two things need to change:

1. Stop depending on `auth.admin.createUser` from inside the leave flow — the `handle_new_user` trigger does heavy profile migration and can fail for edge-case profiles, and even when it fails we get an opaque error.
2. Actually solve Anjali's case so leave can be logged today.

## Plan

**1. Add a Postgres helper (migration)**

Create `public.find_auth_user_id_by_email(_email text) returns uuid` as `security definer`, searching `auth.users` by lower(email). Grant `execute` to `authenticated`. This lets the server function look up the real auth id reliably (no `listUsers` pagination, no reliance on trigger side effects).

**2. Rework `logLeaveForEmployee` in `src/lib/admin-users.functions.ts`**

- Look up the auth id via the new RPC first (instead of `listUsers`).
- If no auth user exists, do NOT call `auth.admin.createUser` inline. Instead:
  - If `profiles.id` equals an existing `auth.users.id` (i.e. the profile IS a real user row that just isn't linked by email), use `profiles.id` directly.
  - Otherwise return a clear, actionable error: `"<email> has no backend account yet. Open Access → Sync missing accounts, then try again."` — no more `{}`.
- Wrap every admin call with a helper that surfaces `err.message || err.error_description || JSON.stringify(err)` so we never render `{}` again.
- Keep the existing "ensure profile row exists for auth id, mark placeholder inactive, ensure leave_balances, insert leave_requests" steps.

**3. Harden `syncMissingAuthAccounts` for this case**

- After each `auth.admin.createUser` (or when it reports "already registered"), resolve the resulting auth id via the new RPC and immediately call the same `ensureProfileForAuthUser` helper used by the leave path, so the profile row is re-pointed to the auth id in one shot. Report per-email errors with full messages (no `{}`).

**4. Manual recovery for Anjali (one-off data change, run after step 1 ships)**

- Call `syncMissingAuthAccounts` from `/access` — with the improvements above it will create `anjali@colladome.in` in auth and rewire the profile.
- Verify by re-logging her 3 unpaid days in June.

## Files touched

- `supabase/migrations/*` — new `find_auth_user_id_by_email` RPC + grants.
- `src/lib/admin-users.functions.ts` — `logLeaveForEmployee` no longer creates users; better error surfacing; `syncMissingAuthAccounts` calls `ensureProfileForAuthUser` and returns full error text.
- No UI changes required; existing toast on `/hr/leave` and `/access` already renders `error.message`.
