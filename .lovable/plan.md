## What this means

This still does **not** look like a manual auth-token problem. You should not paste Google access tokens into the app. The app already has the two backend secrets it needs:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

The recurring `accounts.google.com refused to connect / ERR_BLOCKED_BY_RESPONSE` usually happens when Google is being opened inside an embedded frame or when Google is showing an OAuth error page that cannot be framed. The app should make that impossible by forcing the Calendar OAuth start to happen as a top-level page on the published domain and by showing the exact Google Cloud configuration to check.

## What I will change in the app

1. **Add a dedicated top-level OAuth launch route**
   - Create a public route such as `/google-calendar-connect`.
   - The dashboard button will navigate to that route first.
   - That route will immediately request the Google auth URL and redirect the full browser tab to Google.
   - This avoids starting `accounts.google.com` from an embedded/preview context.

2. **Change the dashboard Calendar button behavior**
   - On the published app, clicking Connect/Open Calendar will use full-page navigation, not iframe/popup-style behavior.
   - In Lovable preview, it will clearly send the user to the published dashboard/launch route.

3. **Keep the stable Google callback URL**
   - Continue using exactly:
     ```text
     https://colladome-pulse.lovable.app/api/public/google/callback
     ```
   - Continue exchanging tokens only on the server.
   - Continue storing tokens securely in the backend, never in the browser.

4. **Improve error messages for the two likely cases**
   - If Google returns `redirect_uri_mismatch`, show the exact callback URL to add in Google Cloud.
   - If Google returns access/permission issues, show the exact Google Cloud checks:
     - Google Calendar API enabled
     - OAuth consent screen published, or your Google account added as a test user
     - Scopes include calendar read access

## What you should check in Google Cloud

Use the same OAuth Client whose Client ID/Secret are saved in Lovable.

1. **Authorized redirect URI** must include exactly:
   ```text
   https://colladome-pulse.lovable.app/api/public/google/callback
   ```

2. **Authorized JavaScript origin** should include:
   ```text
   https://colladome-pulse.lovable.app
   ```

3. **Google Calendar API** must be enabled in that same Google Cloud project.

4. **OAuth consent screen**:
   - If status is Testing, add the Google account you are signing in with as a test user.
   - If your app is for broader users, publish/verify the consent screen as needed.

5. **Scopes** should allow calendar read access:
   ```text
   openid
   email
   https://www.googleapis.com/auth/calendar.readonly
   ```

## What I do not need

- I do **not** need a Google access token.
- I do **not** need your personal Google password.
- I do **not** need any browser-copied auth token.
- If the Client ID/Secret values are wrong or from a different OAuth Client, they should be replaced securely through the app secrets form, not pasted in chat.