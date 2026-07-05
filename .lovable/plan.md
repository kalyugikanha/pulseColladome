## Plan

1. **Treat this as a redirect/callback mismatch, not a popup problem**
   - The screenshot is on `accounts.google.com/signin/oauth/error?...`, which commonly hides a Google OAuth configuration error behind the “blocked” page.
   - The current code builds the callback URL from the request origin, so it can generate different callback URLs depending on preview/published/domain context.

2. **Make Google Calendar OAuth use one stable callback URL**
   - Update the Calendar auth URL server function to always use the published app callback:
     ```text
     https://colladome-pulse.lovable.app/api/public/google/callback
     ```
   - Keep the callback handler exchanging the code with the same exact URL.
   - This prevents Google from receiving preview/dev/cross-origin callback URLs that are not authorized.

3. **Block Calendar OAuth from preview/editor contexts**
   - If the app is running in the Lovable preview/editor iframe, keep sending the user to the published dashboard instead of starting OAuth there.
   - On the published dashboard, start OAuth with a full-page redirect only.

4. **Show the exact callback URL in the UI**
   - Update the Calendar troubleshooting panel to display/copy the one exact callback URL Google must allow.
   - Add clearer text: if Google still shows this error after the code fix, the Google OAuth Client must include that exact callback URL in Authorized redirect URIs.

5. **Verify the flow**
   - Confirm the generated Google OAuth URL contains the stable published `redirect_uri`.
   - Confirm the callback route redirects back to `/dashboard` after a successful token save.

## Important note

If the Google Cloud OAuth client does not already include this exact Authorized redirect URI, no code change can bypass Google’s restriction. The app can generate the correct URL, but Google must allow it:

```text
https://colladome-pulse.lovable.app/api/public/google/callback
```