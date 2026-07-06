## Goal
Stop forcing onboarding on existing employees, but keep it mandatory for any new employee created from now on. Existing users can still access the onboarding/profile page voluntarily from the sidebar avatar.

## Approach

### 1. Database migration
- Backfill: mark all existing profiles as onboarded so the redirect no longer triggers for them.
  - `UPDATE public.profiles SET onboarding_completed = true, onboarding_completed_at = COALESCE(onboarding_completed_at, now()) WHERE onboarding_completed IS DISTINCT FROM true;`
- Change the default for new rows so future signups start as NOT onboarded:
  - `ALTER TABLE public.profiles ALTER COLUMN onboarding_completed SET DEFAULT false;`
- Update `handle_new_user()` trigger to explicitly insert `onboarding_completed = false` for new users (so behavior is explicit regardless of default), keeping all other logic identical.

Result: the ~1920 existing users are flagged complete; anyone created afterward (via HR admin/super admin invite → signup) gets `false` and hits the forced onboarding flow.

### 2. Frontend
No change needed to the redirect logic in `src/routes/_authenticated/route.tsx` — it already redirects only when `!user.onboardingCompleted`. The sidebar footer already links the avatar to `/complete-onboarding`, so existing users retain voluntary access to fill it out later.

## Technical details
- Single migration file with the UPDATE, ALTER DEFAULT, and updated `handle_new_user` function.
- No RLS/policy changes.
- No code changes to routes, hooks, or server functions.

## Out of scope
- Any change to what fields are required during onboarding.
- Any change to the HR admin invite flow itself.
