## Issue

Google's popup shows "Access blocked" when connecting an account. This is a Google Cloud Console configuration issue, not an app code issue — the OAuth client and consent screen need to be set up correctly.

## Root causes (one or more apply)

1. **OAuth consent screen in "Testing" mode without your email as a test user** → Google blocks any account that isn't on the test users list.
2. **Redirect URI mismatch** → the exact callback URL isn't registered on the OAuth client.
3. **Calendar API not enabled** on the Google Cloud project.
4. **Missing scopes** on the consent screen (`calendar.readonly`, `userinfo.email`).

## Fix steps (you do these in Google Cloud Console)

### 1. OAuth consent screen
- APIs & Services → OAuth consent screen
- Either **Publish app** (moves out of Testing so any Google account works), OR
- Under **Test users**, add every teammate's Gmail address that needs to connect.
- Ensure scopes include: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/calendar.readonly`.

### 2. Authorized redirect URIs
On your OAuth 2.0 Client ID, add **both**:
- `https://colladome-pulse.lovable.app/api/public/google/callback` (published)
- `https://id-preview--1f8c7dce-e226-4eaf-9265-a002e7ebfeda.lovable.app/api/public/google/callback` (preview)

Exact match required — no trailing slash, correct scheme.

### 3. Enable Google Calendar API
- APIs & Services → Library → search "Google Calendar API" → Enable.

### 4. Authorized JavaScript origins (only if Google asks)
- `https://colladome-pulse.lovable.app`
- `https://id-preview--1f8c7dce-e226-4eaf-9265-a002e7ebfeda.lovable.app`

## After you fix Google Console

Retry the "Connect Google Calendar" button. If it still fails, share the exact error text shown by Google (e.g. `Error 400: redirect_uri_mismatch` vs `Access blocked: <app> has not completed the Google verification process`) so I can pinpoint which of the above is still off.

## No code changes needed

This is 100% Google Cloud Console configuration. The app's OAuth code, callback route, and token storage are already in place from the previous turn.
