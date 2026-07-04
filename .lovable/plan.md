## Verification result: wiring is correct, but no submission has happened yet to confirm end-to-end

### Code path (verified by reading `src/routes/_authenticated/complete-onboarding.tsx` + `src/lib/onboarding.functions.ts`)

1. Personal social inputs (`facebook`, `instagram`, `twitter`, `youtube`, `pinterest`) are bound to state and included in `saveDraft()` → sent to `saveMyOnboarding` → written to `profiles.<col>_url` via `supabase.from("profiles").update(...)`.
2. `submit()` builds `now = new Date().toISOString()` and calls `saveDraft({ social_follows_confirmed_at: now, reviews_confirmed_at: now })` before `completeMyOnboarding()`, so both timestamps land on the profile row.
3. `completeMyOnboarding` re-reads the profile and rejects with a `missing` list if `social_follows_confirmed_at` / `reviews_confirmed_at` are null, or if any required social URL is empty (Facebook/Instagram/X are in `REQUIRED_PROFILE_FIELDS`; YouTube/Pinterest are optional). Only then does it flip `onboarding_completed = true`.
4. The seven `FOLLOW_LINKS` and four `REVIEW_LINKS` checkboxes gate `submit()` client-side via `allFollowed` / `allReviewed`, so the timestamps can't be set until every box is ticked.

### DB state (queried `profiles`)

No profile currently has `social_follows_confirmed_at` or `reviews_confirmed_at` populated — nobody has completed onboarding since these fields were added, so there's no live row proving the write. The columns exist and are nullable, matching the code.

### Recommendation

The plumbing is correct end-to-end; the only way to fully verify is to submit once. Two options:

- **Option A** — you complete onboarding as a test user, then I re-query `profiles` for that user to confirm the five URL columns and both timestamps are written.
- **Option B** — I add a Playwright script that signs in as a pre-created test user, fills the form, uploads dummy files, ticks every checkbox, submits, and asserts the DB row.

Tell me which you'd like (A is fastest), or if you just want me to trust the code review, no further action is needed.