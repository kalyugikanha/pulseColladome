## Plan

1. **Make the Google Calendar connect action top-level safe**
   - Replace the popup-style `window.open(..., noopener/noreferrer)` behavior with a direct user-click anchor/button flow that opens Google in a real new tab.
   - Keep a visible fallback link so popup blockers do not trap the user.

2. **Improve connection detection after Google authorization**
   - Start polling the calendar connection status as soon as the OAuth tab/link is opened.
   - Stop polling when the app detects the calendar is connected or after a short timeout.
   - Show a clear “waiting for Google authorization” state instead of repeatedly saying the popup was blocked.

3. **Return users to the correct app origin**
   - Keep the callback route using the same origin that started the Google OAuth flow, so preview connects back to preview and published connects back to published.
   - Leave the Google callback path unchanged: `/api/public/google/callback`.

4. **Add better failure guidance for the common Google-side blocks**
   - If Google still returns a 403, display practical guidance: use the published app URL, add the signing-in account as a Google OAuth test user, or publish the Google consent screen.
   - Do not change CORS, app auth providers, or unrelated backend settings.

## Technical details

- Update only the Google Calendar connection component unless inspection during implementation reveals a callback-route bug.
- Do not change OAuth client credentials or redirect URI structure in code.
- Validate in the preview that clicking “Connect Google Calendar” produces a real `accounts.google.com` URL in a new tab/link flow and no longer loops on the blocked iframe/popup message.