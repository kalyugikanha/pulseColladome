## Goal

Extend the onboarding flow so new hires must (a) provide additional social profile links and (b) confirm they've followed Colladome on social media and left Google reviews for both office locations, before they can complete onboarding.

## Flow (updated)

```text
Login → Change password → Complete onboarding
   ├─ Personal details (+ new social fields)
   ├─ Work preferences
   ├─ Bank details
   ├─ Documents
   ├─ NEW: Follow & Review Colladome  ← mandatory checklist
   └─ Submit → app unlocks
```

## Changes

### 1. Personal details — add social profile fields (all required)

Extend the Personal section with:
- Facebook profile URL
- Instagram profile URL
- X (Twitter) profile URL
- YouTube channel URL (optional)
- Pinterest profile URL (optional)

Keep existing LinkedIn and GitHub/GitLab fields.

### 2. New section: "Follow & Review Colladome" (mandatory)

A single card rendered after Documents. Contains two groups of checkboxes; every item must be ticked before submit is allowed.

**Follow our channels** (each row: link opens in new tab + checkbox "I've followed"):
- Facebook — facebook.com/socialcolladome
- Instagram — instagram.com/socialcolladome
- X (Twitter) — x.com/SocialColladome
- LinkedIn — linkedin.com/company/colladome
- YouTube — youtube.com/channel/UCYXQcDiCeW6QVr5oBHWs0uQ
- Pinterest — pinterest.com/SocialColladome
- WhatsApp channel — whatsapp.com/channel/0029VaCRgsEBA1etwQIXHy2C

**Review us** (each row: link + checkbox "I've left a review"):
- Google Review — Jaipur location (g.page/r/CWFNs919eeVQEBM/review)
- Google Review — Hyderabad location (link placeholder — see Open Questions)
- Glassdoor Review
- AmbitionBox Review

The Submit button is disabled until every checkbox is ticked (in addition to the existing personal/bank/document validation).

### 3. Persistence

Add columns to `profiles`:
- `facebook_url`, `instagram_url`, `twitter_url`, `youtube_url`, `pinterest_url` (text, nullable)
- `social_follows_confirmed_at` (timestamptz)
- `reviews_confirmed_at` (timestamptz)

`saveMyOnboarding` accepts the new fields; `completeMyOnboarding` additionally requires the two confirmation timestamps to be set and all required social URLs to be present, otherwise returns a typed missing-list.

### 4. Auto-created welcome task

On successful `completeMyOnboarding`, insert a task for the new hire titled **"Review Colladome on Google & follow our social channels"** with a description linking all channels + review URLs, priority = medium, due in 3 days. This gives them a persistent reminder even after the checklist is confirmed.

### 5. Files touched

- `supabase/migrations/<new>.sql` — add profile columns + confirmation timestamps.
- `src/lib/onboarding.functions.ts` — extend save/complete validators + create the welcome task.
- `src/routes/_authenticated/complete-onboarding.tsx` — new social inputs + Follow & Review card + submit gating.
- `src/integrations/supabase/types.ts` — regenerated after migration.

## Out of scope

- Verifying follows/reviews server-side (we trust the checkbox — same trust model as the rest of the form).
- Editing social links after onboarding (a Profile page can come later).

## Open questions

1. **Hyderabad Google Review URL** — the pasted email only includes the Jaipur `g.page` link. Do you have the Hyderabad review link, or should I use a Google Maps search link as a placeholder?
2. **Facebook / Instagram / X profile URLs** — required or optional for the employee's personal profiles? (Plan currently marks them required; YouTube + Pinterest optional.)
