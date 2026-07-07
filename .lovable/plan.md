## First-login welcome animation

Show a celebratory full-screen overlay the very first time a user signs into the app, then never again for that user.

### What the user sees
- Confetti bursts across the whole viewport (multi-second, multi-burst)
- Large animated headline sweeping in center-screen:
  > "Welcome to the world of AI — to organize you better and be more productive."
- Sub-line:
  > "An initiative by the Admin team @ Colladome. Thanks for the ideas from Kanishka, Sarita, Sweksha & Aarti. Let's get rolling!"
- A "Let's go" dismiss button (also auto-dismisses after ~8s)
- Backdrop blurs the app; body scroll locked while shown

### How we detect "first login"
Add a boolean `welcomed_at timestamptz` column on `profiles` (nullable). On mount inside the authenticated layout:
1. Fetch current profile's `welcomed_at`.
2. If `null` → render `<WelcomeOverlay />`, then on dismiss call an RPC / update that sets `welcomed_at = now()`.
3. If not null → render nothing.

Using the DB (not localStorage) means the welcome shows once per user across devices/browsers, and existing users who have already been using the app won't see it (we backfill `welcomed_at = now()` for all current profiles in the same migration).

### Files
- **Migration**: add `welcomed_at` to `profiles`; backfill existing rows to `now()` so only brand-new sign-ins trigger it; RLS already lets a user update their own profile row.
- **New**: `src/components/WelcomeOverlay.tsx` — confetti (via `canvas-confetti`) + animated headline (Tailwind keyframes already in project: `fade-in`, `scale-in`).
- **New**: `src/hooks/useFirstLoginWelcome.ts` — reads `welcomed_at`, exposes `{ show, dismiss }`.
- **Edit**: `src/routes/_authenticated/route.tsx` — mount the overlay hook + component once for the whole authenticated tree.
- **Dependency**: `bun add canvas-confetti @types/canvas-confetti`.

### Copy (final)
Headline: **Welcome to the world of AI**
Body: *to organize you better and be more productive — an initiative by the Admin team @ Colladome.*
Credits: *Thanks for the ideas from Kanishka, Sarita, Sweksha & Aarti. Let's get rolling!*

### Verify
- New test signup → overlay appears once, confetti fires, dismiss persists.
- Reload / sign in again → no overlay.
- Existing users (backfilled) → no overlay.
