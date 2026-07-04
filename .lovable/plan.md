# Fix Google Calendar connect: "accounts.google.com is blocked"

## What's happening

`ERR_BLOCKED_BY_RESPONSE` means Google refused to load `accounts.google.com` inside a frame. Google sends `X-Frame-Options: DENY`, so any attempt to show the OAuth screen inside the Lovable editor preview iframe is rejected by the browser — this is a Google-side rule, not something we can override with CORS, headers, or code changes to fetch calls.

The current button uses `window.top.location.assign(...)` in the preview, which tries to navigate the whole editor tab to Google. Some browsers (Safari especially, and Chrome in certain preview-embedding modes) still treat that as a framed navigation and block it, producing the exact screen you're seeing.

## The plan

Two changes, both frontend only:

1. **Always open Google OAuth in a new browser tab** from the Connect button — never navigate the current window/frame. New-tab navigations are top-level to the browser, so Google's frame block does not apply.
2. **Return the user to the app after Google finishes**. The existing callback route already redirects to `/dashboard`. We'll close the OAuth tab (or navigate it back to `/dashboard`) after success and have the original app tab refresh the "Connected" state by polling the `google_calendar_tokens` row once every few seconds until it appears (or the user cancels).

## Behavior after the fix

- Click "Connect Google Calendar" → a new tab opens on `accounts.google.com`.
- User approves → Google redirects to our `/api/public/google/callback` → callback stores tokens → tab redirects to `/dashboard` (or closes itself if it was opened by us).
- Original app tab detects the new token row and flips to "Connected", no reload needed.

## What we won't change

- No changes to the OAuth callback route logic, redirect URI, or the Google Cloud OAuth config.
- No changes to Supabase auth settings.
- No CORS or fetch-level changes.
- No changes to any other feature.

## Technical details

- `src/components/google-calendar-connect.tsx`
  - Replace the `window.top.location.assign` / `window.location.assign` branch with a single `window.open(url, "_blank", "noopener,noreferrer")`.
  - If the popup is blocked, show an inline message with a plain `<a target="_blank" rel="noopener noreferrer">` fallback link the user can click.
  - Add a lightweight poll (every 3s, max ~2 min, cleared on unmount) that re-queries `google_calendar_tokens` for the current user and updates the "Connected" state when the row appears. Stop polling on success or when the user navigates away.
  - Keep the existing 403 help card so users still know they can also try the published URL if Google's consent screen rejects them for another reason (unpublished OAuth app, non-test user, etc.).

- `src/routes/api/public/google/callback.ts`
  - No functional change required. It already 302s to `/dashboard` on success. That works whether the tab was opened via `window.open` (user just closes it or leaves it on the dashboard) or via full navigation.

## Note about the preview vs published site

Even with the new-tab fix, Google can still reject OAuth started from a preview URL if the OAuth consent screen in Google Cloud is set to "Testing" and the signing-in account isn't listed as a test user, or if a Workspace admin blocks third-party apps. If that happens after this fix, the error will be a Google 403 page (not the browser's `ERR_BLOCKED_BY_RESPONSE`), and the remedy is on the Google Cloud side (publish the consent screen or add the account as a test user). The published app URL is the most reliable place to test OAuth end-to-end.
