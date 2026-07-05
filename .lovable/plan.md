## What’s happening

The screenshot is no longer a callback URI mismatch. Google is now blocking the Calendar OAuth app because the Google Cloud OAuth consent screen is in Testing and the signed-in Google account is not an approved test user, or the consent screen has not been published/verified.

## Plan

1. **Keep the existing Calendar OAuth redirect URI unchanged**
   - Continue using `https://colladome-pulse.lovable.app/api/public/google/callback` for the Calendar OAuth flow.
   - Do not change the app’s normal Google sign-in flow.

2. **Improve the Calendar connection page guidance**
   - Update the Google Calendar connect screen to explicitly distinguish:
     - `redirect_uri_mismatch`: callback URI issue
     - `access_denied` / `403`: Google consent screen verification or test-user issue
   - Show the exact Google account from the blocked screen as something that must be added under Google Cloud OAuth consent screen test users while the app is in Testing.

3. **Improve the callback error page**
   - Update the current `access_denied` message to say this means Google accepted the callback but blocked access because the app has not completed verification or the account is not an approved tester.
   - Include the required remedy: add the user as a test user in Google Cloud, or publish/verify the OAuth consent screen if this is for public users.

4. **Optional safer Calendar scopes adjustment**
   - Review whether both Calendar scopes are truly required.
   - If booking creation is needed, keep `calendar.events`.
   - If the app only reads events, reduce to `calendar.readonly` to make Google verification easier.

## What you still need to do in Google Cloud

- Open the OAuth consent screen for the same Google Cloud project as the saved Calendar Client ID.
- If publishing status is **Testing**, add `shubham@colladome.com` as a test user.
- If this should work for anyone outside test users, complete Google’s app verification/publishing process.
- Keep the authorized redirect URI exactly:
  `https://colladome-pulse.lovable.app/api/public/google/callback`