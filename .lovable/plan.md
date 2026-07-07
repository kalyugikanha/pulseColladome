## Show welcome overlay on every sign-in

Switch from "once per user forever" to "once per sign-in event" on the live URL.

### Change
- Drop the `profiles.welcomed_at` gate. Instead, trigger the overlay from Supabase's `onAuthStateChange` `SIGNED_IN` event.
- `src/hooks/useFirstLoginWelcome.ts` → rename intent to `useWelcomeOnSignIn(userId)`:
  - Subscribe to `supabase.auth.onAuthStateChange`.
  - When event === `"SIGNED_IN"` AND hostname === `colladome-pulse.lovable.app`, set `show = true`.
  - `dismiss()` just sets `show = false` (no DB write).
- Keep the live-URL gate so preview/localhost stay quiet.
- Leave the `welcomed_at` column in place (harmless, no code path reads it anymore).

### Why `SIGNED_IN` and not mount
`SIGNED_IN` fires only on an actual auth transition (fresh login, OAuth return). Page reloads and tab switches fire `TOKEN_REFRESHED` / `INITIAL_SESSION`, which we ignore — so the overlay shows on real sign-ins, not on every reload.

### Verify on live URL
- Sign out → sign in → overlay + confetti appears.
- Reload the page while signed in → no overlay.
- Sign out → sign in again → overlay appears again.
