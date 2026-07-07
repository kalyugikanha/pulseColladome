## Root cause — trigger bug, not OAuth / proxy

Juhi has **no `auth.users` row** (never signed in successfully) but she already has a `public.profiles` row seeded ahead of time:

```
id      = 11111111-0000-0000-0000-000000000007
email   = juhi@colladome.com
```

`public.profiles` has a unique index `profiles_email_lower_unique` on `lower(email)`.

When she signs in with Google for the first time, the `handle_new_user()` trigger (fires on `INSERT INTO auth.users`) runs the "placeholder retarget" branch:

1. `INSERT INTO public.profiles(id, …, email, …) VALUES (NEW.id, …, 'juhi@colladome.com', …)` ← **fails** on `profiles_email_lower_unique` because the placeholder row with the same lowercased email still exists.
2. Trigger raises → Supabase aborts the auth signup → the OAuth callback returns
   `#error=server_error&error_description=failed+to+sign+in+with+vendor`.

That's the exact error Juhi is seeing. 4 profiles in the DB are in this same "seeded placeholder, never signed in" state — all will hit the same failure on their first login.

The published-URL fetch-proxy story doesn't apply here (this is `error_description=failed+to+sign+in+with+vendor` from the auth server itself, not a network failure in the browser).

## Fix — one migration, `handle_new_user()` update

Patch the placeholder branch to remove the email-collision before the insert. Because `profiles_email_lower_unique` is a partial index `WHERE email IS NOT NULL`, nulling the placeholder's email removes it from the index without dropping the row (we still need the row so FK retargeting can find children).

New order inside the `ph.id IS NOT NULL AND ph.id <> NEW.id` branch:

```sql
-- 0) Free the unique-lower(email) index slot held by the placeholder.
UPDATE public.profiles SET email = NULL WHERE id = ph.id;

-- 1) Insert the new profile row with the real auth uid.
INSERT INTO public.profiles (id, …, email, …) VALUES (NEW.id, …, NEW.email, …);

-- 2) Retarget all FKs from ph.id → NEW.id (unchanged, existing UPDATEs).
-- 3) DELETE FROM public.profiles WHERE id = ph.id;
```

Everything else in the function stays as-is (role grants, salaries, leave balances, manager back-fill).

## Verify

- After migration, ask Juhi to try Google sign-in again on the published URL. She should land in the app, `auth.users` gets her row, `profiles` gets her real uid, placeholder row is gone.
- Spot-check one other placeholder user via `SELECT id, email, is_placeholder FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL;` — the row should disappear after that user's first successful sign-in.
- No code changes on the frontend; no OAuth reconfig needed.

## Files touched

- New migration `supabase/migrations/…_fix_handle_new_user_email_collision.sql` — `CREATE OR REPLACE FUNCTION public.handle_new_user()` with the extra `UPDATE … SET email = NULL` at the top of the placeholder branch.
