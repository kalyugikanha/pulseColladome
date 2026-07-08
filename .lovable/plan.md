## Remove onboarding confetti / welcome overlay

### What
Completely remove the animated confetti welcome overlay that fires on sign-in so it never appears, regardless of how many times a user has signed in.

### How
1. **In `src/routes/_authenticated/route.tsx`:**
   - Remove the `WelcomeOverlay` import.
   - Remove the `useFirstLoginWelcome` import and call.
   - Remove the `{welcome.show && <WelcomeOverlay ... />}` render line.

2. **In `src/routes/auth.tsx`:**
   - Remove the `sessionStorage.setItem("pulse:welcome", "1")` line that flags the session for the overlay.

3. **Cleanup (optional — confirm preference):**
   - Delete `src/components/WelcomeOverlay.tsx` and `src/hooks/useFirstLoginWelcome.ts` since they become dead code, OR leave them in place if you want to re-enable later.

### Verification
- Sign in (fresh or returning) — no confetti or welcome modal appears.
- Dashboard loads directly without the overlay.
