## Goal

Replace the current `/` redirect-to-dashboard behavior with a bold, founder-voice landing page for Colladome Pulse. The page centers on a motivational vision — "we adapt first, we build the future with AI" — instead of listing product modules. A large inspirational quote rotates every day.

## Behavior

- Signed-out visitors land on the new hero-first landing page.
- Signed-in users still go straight to `/dashboard` (existing behavior preserved via a client-side check, not a hard redirect).
- The daily quote is deterministic per calendar day (same quote for everyone on a given day), rotating automatically at local midnight. No backend needed — a fixed curated list indexed by day-of-year.

## Page structure (`src/routes/index.tsx`)

1. **Hero (full viewport)**
   - Small eyebrow: "A note from the founder"
   - Massive headline in the founder's voice, e.g.:
     *"The world is being rewritten by AI. We're not watching — we're the ones holding the pen."*
   - 2–3 supporting motivational lines about adapting first and advocating the shift.
   - Primary CTA: "Enter Pulse" → `/auth` (or `/dashboard` if signed in). Secondary: "Read the vision" scroll anchor.

2. **Daily Quote block**
   - Large serif quote, attribution, and a subtle "Quote of the day · {date}" label.
   - Rotates daily from a curated array (~30+ quotes on adaptation, building, future, AI, courage).

3. **Founder manifesto section**
   - 3–4 short inspirational statements (not feature bullets), each one line, staggered layout.
   - Signed "— Founder, Colladome".

4. **Footer CTA**
   - One line: "Build the future with us." + button to sign in.

## Visual direction

- Dark, cinematic background with a subtle animated gradient / grain.
- Distinctive typography: a display serif (e.g. Instrument Serif) for the headline + quote, paired with a clean sans (Work Sans / Inter fallback already loaded) for body.
- Use existing semantic tokens in `src/styles.css`; add a new `--gradient-hero` and `--shadow-glow` if needed. No hardcoded colors.
- Framer-motion fade/slide-in on hero and quote.

## Technical details

- Convert `src/routes/index.tsx` from a `beforeLoad` redirect to a real `component`. Keep it a public route (no server function calls in loader).
- Client-side effect: if `supabase.auth.getSession()` returns a session, `navigate({ to: '/dashboard' })`. Otherwise render the landing page.
- Daily quote selection: `const idx = Math.floor((Date.now() - Date.UTC(new Date().getFullYear(),0,0)) / 86400000) % QUOTES.length`. Pure client, no state, SSR-safe (compute in component using `new Date()` inside `useMemo`).
- Set proper `head()` metadata: title "Colladome Pulse — Build the future with AI", matching description, og tags.
- Keep changes UI-only; no DB, no server functions, no new dependencies (framer-motion already in project).

## Out of scope

- No changes to auth, dashboard, punch, or calendar flows.
- No CMS/admin for quotes — curated in-code list is intentional for v1.
