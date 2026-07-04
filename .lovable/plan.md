## Plan

The screenshot shows Google is being opened inside the app preview iframe, which Google blocks with `accounts.google.com refused to connect` / `ERR_BLOCKED_BY_RESPONSE`. The fix is to make the Google Calendar connection use a top-level browser redirect instead of an embedded popup/iframe flow.

## Changes

1. Update the **Connect Google Calendar** button flow:
   - Request the Google OAuth URL from the backend as it does now.
   - Navigate the current top-level window to that URL instead of opening it in a popup.
   - Keep the existing fallback behavior simple and reliable.

2. Update the Google callback page:
   - After a successful connection, redirect the user back to the dashboard instead of trying to close a popup.
   - Keep readable success/error pages for failed callbacks.

3. Preserve the existing Google Calendar backend logic:
   - Keep the current per-user token storage.
   - Keep the existing callback URL: `/api/public/google/callback`.
   - No database changes are needed.

## What you may still need to check in Google Cloud

If Google then shows a different error like `redirect_uri_mismatch`, the OAuth client must include these exact callback URLs:

- `https://colladome-pulse.lovable.app/api/public/google/callback`
- `https://id-preview--1f8c7dce-e226-4eaf-9265-a002e7ebfeda.lovable.app/api/public/google/callback`

And the Google Calendar API must be enabled.