## Goal
Make onboarding mandatory-on-first-sign-in for everyone **except super admins**, and let anyone (super admins included) open and update those onboarding details later from their profile at any time.

## Changes

### 1. Skip the forced redirect for super admins
`src/routes/_authenticated/route.tsx` — the effect at lines 172–181 currently sends every user with `!onboardingCompleted` to `/complete-onboarding`. Add an early-return when `user.isSuperAdmin` so super admins are never pushed into the flow. Password-change gate stays as-is.

Result:
- Non-super-admin, first sign-in → still redirected to `/complete-onboarding`.
- Super admin, first sign-in → lands on `/dashboard` normally.

### 2. Let anyone open the onboarding form later ("profile")
`/complete-onboarding` already renders the full form and works for anyone signed in. We'll expose it as the user's profile entry point so it's reachable anytime:

- Add a **"My profile"** menu in the sidebar footer user block (`src/routes/_authenticated/route.tsx`, around lines 151–162) — a small dropdown on the avatar/name with two items: "My profile" → `/complete-onboarding`, and the existing "Sign out".
- Inside `src/routes/_authenticated/complete-onboarding.tsx`, soften the copy when the user has already completed onboarding (heading becomes "My profile", the "You must complete this before continuing" tone is dropped, and the primary button says "Save changes" instead of "Complete onboarding"). Same fields, same save handlers.

No change to server functions, DB schema, or the completion validation logic — `completeMyOnboarding` still enforces required fields when a non-super-admin submits for the first time.

## Out of scope
- No new `/profile` route (reuses `/complete-onboarding`, which already has every field and upload).
- No change to which fields are required, nor to the super-admin's ability to voluntarily fill the form later.
- No email/notification changes.

## Verification
1. Sign in as a super admin whose `onboarding_completed = false` → lands on `/dashboard`, no redirect loop.
2. Sign in as a non-super-admin whose `onboarding_completed = false` → redirected to `/complete-onboarding` as today.
3. As any signed-in user, click avatar → "My profile" → `/complete-onboarding` opens with existing data and a "Save changes" button.
