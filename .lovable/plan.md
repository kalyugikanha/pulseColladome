## Plan

The new Google page is a `403` from Google itself. The previous iframe-blocking issue is fixed, but this now points to one of two likely causes:

1. The flow is still being started from the Lovable preview context, which Google can reject.
2. The Google OAuth app is in Testing mode and the selected Google account is not allowed as a test user, or the OAuth client/app access is restricted.

## Changes I will make in the app

1. Make the Google Calendar connect flow more reliable:
   - Open Google Calendar OAuth as a normal top-level browser navigation.
   - Add clear in-app guidance when starting from preview so users know to test the connection from the published app URL if Google blocks preview access.

2. Keep the callback route returning the user to `/dashboard` after success.

3. Add a small error/help state near the **Connect Google Calendar** button explaining what to check if Google returns 403.

## Google Cloud checks you need to make

In Google Cloud, confirm:

- OAuth consent screen is **Published**, or your Google account is added under **Test users**.
- Google Calendar API is enabled.
- OAuth client has these exact redirect URIs:
  - `https://colladome-pulse.lovable.app/api/public/google/callback`
  - `https://id-preview--1f8c7dce-e226-4eaf-9265-a002e7ebfeda.lovable.app/api/public/google/callback`
- If your Google Workspace admin restricts third-party app access, the app must be allowed by the admin.

## Important

If the 403 only happens in the Lovable preview, test the same button on the published app:

`https://colladome-pulse.lovable.app/dashboard`

Google OAuth often behaves differently outside the editor preview.