
## What's actually happening

I checked the database directly. There is only **one** row for `sweksha@colladome.in` in `public.profiles` (a placeholder row in the "Human Resources" department, created before she signed in). There is no matching entry in `auth.users` and no matching `role_grants` row.

So the duplicate you're seeing on `/directory` is not two DB records — it's the same record being rendered twice. Right now nothing in the code (or the schema) actually stops two profile rows from sharing the same email, so I want to fix both layers: harden the UI so a duplicate never renders, and add a DB guard so two profile rows can never share an email again.

## Changes

### 1. Directory list — dedupe defensively

In `src/routes/_authenticated/directory.tsx`, after the `profiles` query returns, collapse the array by `id` (and, as a secondary safety net, by `lower(email)`) before it feeds `rows`. If two records ever slip through with the same id or email, only the most-complete one (non-placeholder wins, active wins) is kept. This guarantees the table can never show the same person twice regardless of what the query returns.

### 2. Database — prevent duplicates going forward

Add a case-insensitive uniqueness guard on `public.profiles.email` so we can never end up with two rows for the same address:

```sql
-- de-dupe any existing collisions first (keep the non-placeholder / oldest row),
-- then enforce uniqueness
CREATE UNIQUE INDEX profiles_email_lower_unique
  ON public.profiles (lower(email))
  WHERE email IS NOT NULL;
```

The migration will:
- Find every `lower(email)` group with more than one row.
- Keep the row that is `is_placeholder = false` first, then the oldest `created_at`; delete the losers (after re-pointing any FK references to the survivor, same pattern already used in `handle_new_user`).
- Create the partial unique index.

### 3. Verify

After the migration runs, open `/directory`, search "sweksha", and confirm exactly one row. Also confirm no other duplicate emails remain by re-running the group-by check.

## Out of scope

- The Marketing Kanban roster, Access page, and other lists — the same dedupe is not needed there today, but the unique index in §2 protects them automatically.
- Merging Sweksha's placeholder with a future signed-in account — the existing `handle_new_user` trigger already does that correctly; this plan just makes sure no stray duplicate can exist in the meantime.
