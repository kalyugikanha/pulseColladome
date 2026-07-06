# Grandfather existing users past onboarding

Only enforce onboarding for users created from now onward. Existing users can skip.

## Migration (single)

1. Add `public.profiles.onboarding_required boolean NOT NULL DEFAULT true`.
2. Backfill: `UPDATE public.profiles SET onboarding_required = false WHERE created_at < now();` (i.e. all currently-existing rows are exempt).
3. Update `public.handle_new_user()` trigger to insert `onboarding_required = true` for new signups (default already handles it, but set explicitly for clarity).

New users going forward get `onboarding_required = true`; existing users have `false`.

## Server (`src/lib/onboarding.functions.ts` and `src/hooks/use-current-user.ts`)

- Expose `onboarding_required` on the current-user hook alongside `onboardingCompleted`.

## Route gate (`src/routes/_authenticated/route.tsx`, line ~207)

Change the redirect condition from:
```
!user.onboardingCompleted
```
to:
```
user.onboardingRequired && !user.onboardingCompleted
```
So existing users (with `onboarding_required = false`) are never forced to `/complete-onboarding`. New users still are.

## Complete-onboarding page (`src/routes/_authenticated/complete-onboarding.tsx`)

No functional change — existing users can still visit it voluntarily via the "My profile" link to fill things in; they just aren't forced.

## Not changing

- The onboarding checklist / task list itself.
- Admin onboarding overview page.
- Any RLS policies (column is user-readable via existing profile SELECT policy).
