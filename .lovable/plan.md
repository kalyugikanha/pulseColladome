## Plan

### 1. Confirm the Calendar OAuth URL is using your Google Cloud credentials
- Keep Calendar sync separate from normal Pulse Google sign-in.
- Verify the Calendar flow uses `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`, which are the Google Cloud Console credentials you provided.
- Confirm the generated Google URL sends this exact callback:
  `https://colladome-pulse.lovable.app/api/public/google/callback`

### 2. Fix the actual redirect mismatch cause
- The screenshot shows Google Calendar OAuth is reaching Google, but Google rejects the `redirect_uri`.
- This means the OAuth client in Google Cloud must contain the exact callback URL above under **Authorized redirect URIs**.
- If your Google Cloud OAuth client has a different callback, preview URL, dashboard URL, trailing slash, or `/auth` URL, Google will keep showing `redirect_uri_mismatch`.

### 3. Add an in-app credential sanity check for Calendar OAuth
- Add a backend check that builds the Calendar OAuth URL and returns:
  - the exact `redirect_uri` being sent to Google,
  - whether Calendar OAuth client ID/secret are present,
  - the expected published callback URL,
  - clear setup instructions.
- Do not expose the secret value.

### 4. Improve the Calendar connect screen
- Show a “Google Cloud setup check” panel before redirecting, so you can copy the exact callback URL.
- Make the error text explicit: this is **Calendar OAuth**, not Pulse sign-in.
- Add a direct “Copy callback URL” affordance for:
  - Authorized redirect URI: `https://colladome-pulse.lovable.app/api/public/google/callback`
  - Authorized JavaScript origin: `https://colladome-pulse.lovable.app`

### 5. Validate the flow
- Test the generated Calendar OAuth URL and confirm it contains the expected `client_id` and `redirect_uri`.
- Re-check `/auth` stays on managed Pulse Google sign-in.
- Re-check `/google-calendar-connect` starts only the Calendar OAuth flow.

### Important note
No code change can bypass Google’s `redirect_uri_mismatch`. The app can only make sure it sends the correct callback and shows it clearly. The final fix requires the same callback URL to be added to the Google Cloud OAuth client that owns the Calendar Client ID/Secret.