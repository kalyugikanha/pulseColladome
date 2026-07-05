## Fix: Google Calendar "accounts.google.com refused to connect" (ERR_BLOCKED_BY_RESPONSE)

### Root cause

`ERR_BLOCKED_BY_RESPONSE` from `accounts.google.com` means Google is being loaded inside an iframe — Google sends `X-Frame-Options: DENY`, so any framed load is refused. Our current flow makes this easy to trigger:

1. Click Connect → we `window.open("about:blank", "_blank")` → then `authTab.location.replace(launchUrl)` → the launch page does `window.location.replace(authUrl)`.
2. On some browsers / when clicked from certain contexts (or when the "popup" ends up rendered inside the editor iframe rather than as a real tab), Google's URL is loaded framed and the browser blocks it.
3. The intermediate `/google-calendar-oauth-launch` page adds an extra navigation hop that can inherit the framed context.

Google Sign-In works because it goes through Lovable's managed OAuth broker (`lovable.auth.signInWithOAuth`), which is iframe-safe. Our custom Calendar OAuth doesn't use that broker, so we need an iframe-safe flow of our own.

### Fix (frontend only, backend already correct)

Replace the popup/launch-page dance with a **top-level navigation** to Google's OAuth URL, done from the published site.

1. **`src/components/google-calendar-connect.tsx`**
   - Remove `window.open("about:blank", "_blank")` + launch-page indirection for the normal case.
   - On click (published/custom domain, not embedded):
     - If `disconnectFirst`, await disconnect.
     - Call `getGoogleAuthUrl()` → get `url`.
     - Persist a "returning from Google" marker (e.g. `sessionStorage.setItem("gcal:returning","1")`) so we can auto-refresh status on return.
     - `window.top.location.href = url` (use `_top` to break out of any iframe; falls back to `window.location.href` if `window.top` is cross-origin).
   - If `isOAuthBlockedContext` (embedded Lovable preview): keep current behavior — show button that opens the published dashboard in a new tab. Do **not** attempt OAuth from inside the preview iframe.
   - On mount, if the `gcal:returning` marker is set, clear it and invalidate `["my-google-status"]` so the card flips to Connected without a manual refresh.
   - Drop the popup-blocked branch and the pending-launch-URL fallback link (no longer needed).

2. **`src/routes/google-calendar-oauth-launch.tsx`** — delete. No longer used. (Removing it also eliminates the framed-navigation hop entirely.)

3. **`src/components/google-calendar-connect.tsx` troubleshooting panel**
   - Replace the "popup blocked" copy with "If nothing happened, allow this site to navigate to accounts.google.com" and keep the redirect_uri_mismatch / access-blocked / wrong-account items.
   - Keep the "Open published dashboard" CTA for the embedded-preview case.

### What stays the same

- `src/lib/google-calendar.server.ts`, `src/lib/google-calendar.functions.ts`, `src/routes/api/public/google/callback.ts` — unchanged. Callback already redirects back to `/dashboard`.
- Secrets `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` are already set.
- The redirect URI `https://colladome-pulse.lovable.app/api/public/google/callback` must remain in the OAuth client's Authorized redirect URIs in Google Cloud Console (it already is, since sign-in works — but if a separate OAuth client is used for Calendar, that one needs it).

### Result

From the published dashboard, clicking Connect Google Calendar sends the current tab to Google's OAuth page (no iframe, no popup, no `ERR_BLOCKED_BY_RESPONSE`). Google returns to `/api/public/google/callback`, which redirects to `/dashboard` with tokens saved. From the Lovable editor preview, the button opens the published dashboard in a new tab — same as today.
