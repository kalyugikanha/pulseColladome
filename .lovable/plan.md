## Diagnosis

This is **not an auth token issue**.

Your screenshot URL contains Google’s encoded error:

```text
redirect_uri_mismatch
```

That means Google is rejecting the Calendar OAuth request because the **redirect/callback URL in the app does not exactly match what is configured in your Google Cloud OAuth Client**.

Do **not** paste or rotate access tokens for this. The app should never use a manually copied Google auth token for user Calendar access.

## What you need to do in Google Cloud

In the same Google Cloud project where your Calendar OAuth Client ID/Secret were created:

1. Go to **APIs & Services → Credentials**.
2. Open the **OAuth 2.0 Client ID** used by this app for Calendar.
3. Under **Authorized redirect URIs**, add this exact URL:

```text
https://colladome-pulse.lovable.app/api/public/google/callback
```

4. Under **Authorized JavaScript origins**, add:

```text
https://colladome-pulse.lovable.app
```

5. Make sure **Google Calendar API** is enabled in that Google Cloud project.
6. If the OAuth consent screen is in **Testing**, add the Google account you are using as a **Test user**.
7. Save changes, wait 1–2 minutes, then try the Calendar connect again from:

```text
https://colladome-pulse.lovable.app/dashboard
```

## What I will adjust in the app after approval

1. **Add a clearer Calendar OAuth diagnostic panel**
   - Show the exact required callback URL.
   - Show the exact required JavaScript origin.
   - Add copy buttons for both values.
   - Replace the generic “403” wording with a specific `redirect_uri_mismatch` explanation.

2. **Add a small server-side OAuth sanity check**
   - Confirm the generated Google auth URL includes:
     ```text
     redirect_uri=https://colladome-pulse.lovable.app/api/public/google/callback
     ```
   - Surface a readable app error if Calendar OAuth env config is missing.

3. **Keep the secure OAuth flow**
   - No manual Google access tokens.
   - No tokens in the browser.
   - No iframe/popup workaround for `accounts.google.com`.
   - Full-page redirect only from the published dashboard.

## Key point

The only “auth/token” values needed in the app are the saved Google OAuth **Client ID** and **Client Secret**. The error you shared is fixed by matching Google Cloud’s allowed redirect URI to the app’s callback URL exactly.