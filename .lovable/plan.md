## Plan

### 1. Make the new landing page actually visible
- Update `/` so it always shows the founder-vision landing page, even if a user is already signed in.
- Keep clear calls to action:
  - Signed out: `Sign in` / `Enter Pulse`
  - Signed in: `Go to dashboard`
- This removes the current behavior where signed-in users are immediately redirected to `/dashboard`, which makes it look like the landing page never changed.

### 2. Publish-ready landing verification
- Verify the published home page route is `/` and the content is the new AI/founder vision page.
- Keep dashboard access separate from the landing page instead of using the landing page as an auth redirect.

### 3. Fix Google sign-in OAuth first
- Reconfigure Lovable Cloud Google sign-in using the managed Google provider.
- Keep the app code using the supported `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })` flow.
- Do not add custom popup/iframe workarounds or manual Google credentials for normal app sign-in.

### 4. Separate Google Calendar OAuth from app sign-in
- Audit the calendar connection flow so it is clearly separate from normal Google login.
- Keep the Calendar flow using the exact published callback:
  `https://colladome-pulse.lovable.app/api/public/google/callback`
- Add clearer in-app error text so if Calendar OAuth still fails, it tells us whether the failure is from:
  - normal app Google sign-in, or
  - Google Calendar sync permissions / redirect URI setup.

### 5. Validate after changes
- Check `/` while signed out and signed in.
- Check `/auth` Google sign-in starts without `redirect_uri_mismatch`.
- Check the Calendar connect page still shows the exact callback URL needed for Google Calendar sync.

### Important note
If the screenshot came from the **Calendar Connect** button, Google still requires that exact callback URL to be added in the Google Cloud OAuth client used for Calendar access. If it came from **Continue with Google** on `/auth`, the managed Google sign-in reconfiguration should fix it.