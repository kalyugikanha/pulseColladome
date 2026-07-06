## Diagnosis
Kanishka's Google account exists in `auth.users` (provider `google`, last sign-in Jul 4) — the account itself is fine. The failure is in the client OAuth flow in `src/routes/auth.tsx`. Two smells that together explain "click Google → return to sign-in screen, no error":

1. **`extraParams: { hd: "*" }`** restricts the Google chooser to *any Google Workspace* account and rejects personal Gmail. If Kanishka's `kanishka@colladome.in` isn't backed by a Workspace tenant that Google's `hd` filter recognises for her session (secondary domain, alias, or SSO artefact), Google closes the flow silently. `enforce_colladome_email()` in the DB already blocks non-Colladome domains, so `hd` is redundant defence at the cost of false negatives.
2. **`redirect_uri: window.location.origin`** returns her to `/` (landing page). Landing page keeps its "Sign in" nav until a `useEffect` hydrates the session; if she taps it before that, she goes to `/auth`, which flashes as "same sign-in screen again" until `beforeLoad` finishes and forwards to `/dashboard`. Not itself the bug, but it turns any hiccup above into "nothing happened".

## Fix (frontend only)
File: `src/routes/auth.tsx`

- Drop `hd: "*"`. Keep `prompt: "select_account"`. Domain enforcement stays with the DB trigger, whose error message already surfaces via the existing `/colladome/i` toast.
- Send OAuth to a dedicated public callback route so the return path always resolves the session before deciding where to go.

New file: `src/routes/auth.callback.tsx` (public, no auth guard)

- On mount, `await supabase.auth.getSession()` with a short retry (up to ~2s) to cover the tiny race after the broker sets tokens.
- If session present → `navigate({ to: "/dashboard", replace: true })`.
- If still no session after retry → `navigate({ to: "/auth", replace: true })` with a toast "Sign-in didn't complete — please try again."
- Renders a minimal "Signing you in…" spinner card.

Update `handleGoogle` to pass `redirect_uri: \`${window.location.origin}/auth/callback\``.

## Verification
1. In the preview (iframe popup flow) sign in with a Colladome Google account → land on `/dashboard`.
2. On the published URL, full-page redirect → returns to `/auth/callback` → forwards to `/dashboard`.
3. Ask Kanishka to retry on `https://colladome-pulse.lovable.app`; if she still hits the screen with no message, capture the browser console at that moment — that will tell us whether Google returned `error=access_denied` or the session simply never landed.

## Out of scope
- No auth provider config changes; managed Google OAuth handled by Lovable is left as-is.
- No changes to the DB email-domain trigger.
