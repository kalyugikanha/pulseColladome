## Skip onboarding/password enforcement (dev mode)

Add a single flag `ENFORCE_ONBOARDING = false` in `src/routes/_authenticated/route.tsx` that short-circuits the redirect effect (lines 192-201). While `false`:

- No auto-redirect to `/complete-onboarding` for users with `onboarding_completed = false`
- No auto-redirect to `/change-password` for users with `must_change_password = true`
- Users can freely navigate the app so you can impersonate/view each person's screens and fix remaining issues
- The `/complete-onboarding` and `/change-password` pages remain reachable manually via the profile link

When you say "moving to production", I'll flip the flag to `true` to re-enforce both redirects.

No other files change. No DB changes.
