## Why most salaries are blank

Only 3 people have actually signed up so far: **Arti, Jagjeet, Shubham**. Everyone else is on the invite list (`role_grants`) with a configured salary, but has no auth account yet — and a `salaries` row needs a real user id, so we can't create one until they sign up. The `handle_new_user` trigger will insert their salary automatically the moment they log in for the first time.

Sweksha is a separate case: she signed up with `sweksha.colladome@gmail.com` but her invite is under `sweksha@colladome.in`, so the two don't link.

Here's the current state:

```text
Signed up + salary set: Arti, Jagjeet, Shubham
Signed up, no match:    Sweksha (email mismatch)
Not signed up yet (14): Akash, Anjali, Arpit, Chirag, Deepak, Hemanth,
                        Juhi, Kanishka, Manvi, Neetu, Riyanshi, Sandeep,
                        Shraddha, Trisha
```

## What I'll change

### 1. Show the full team on Finances + Project Burn, not just signed-up users

Union `profiles` with `role_grants` so every invited employee appears. Rows with no profile show a **"Pending signup"** badge, use their `default_monthly_salary` from the grant for display, and are excluded from burn math (no logged hours yet anyway).

Salary column shows:
- Signed up + salary set → actual salary
- Not signed up → grant salary + "Pending signup" badge
- Signed up but no salary/grant → "Not set"

### 2. Fix Sweksha's link

Add a data fix so her existing profile (`sweksha.colladome@gmail.com`) gets the ₹5,000 salary row, and add `sweksha.colladome@gmail.com` to `role_grants` as an alias so future re-runs stay consistent.

### 3. Small UX addition on Finances

Add a "Pending invites" count card and a list of who hasn't signed up yet, so you can chase them.

## Technical notes

- New migration: (a) insert salary row for Sweksha's profile id at ₹5,000, (b) add grant row for `sweksha.colladome@gmail.com`.
- `src/routes/_authenticated/finances.tsx`: query `role_grants` too, merge with `profiles` by lowercased email, render unified rows with status.
- `src/routes/_authenticated/project-burn.tsx`: same merged list feeds the "salary pool" stat so it reflects total configured salaries, not just signed-up ones.
- No schema change to the `salaries` table — its `user_id` FK stays intact.

## What I won't do (unless you ask)

- Bulk-create auth accounts for the 14 pending users. Per the earlier decision you chose "Self sign-up + forced change", so they'll sign up themselves with `Test@123` and get forced to change it.
- Change salaries to be email-keyed. Keeping them tied to a real user id keeps RLS clean.