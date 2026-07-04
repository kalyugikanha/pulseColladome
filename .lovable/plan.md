## Plan

1. **Treat embedded preview as a blocked OAuth context**
   - Detect when the app is running inside the Lovable preview iframe using `window.top !== window.self` and the Lovable referrer/origin.
   - Do not start Google OAuth from that embedded context, because Google blocks `accounts.google.com` in framed/sandboxed flows.

2. **Change Connect/Reconnect behavior in preview**
   - When embedded in preview, make **Connect Google Calendar** / **Reconnect** open the published dashboard (`https://colladome-pulse.lovable.app/dashboard`) in a new top-level tab instead of generating and opening a Google auth URL from preview.
   - Keep the normal OAuth flow for the published/top-level app.

3. **Update on-screen copy to be explicit**
   - Replace the current preview warning with a stronger message: Google Calendar connection must be completed from the published app, not from the Lovable preview.
   - Update the troubleshooting item for `accounts.google.com is blocked` to say the fix is opening the published dashboard, not retrying from preview.

4. **Keep existing backend/OAuth security unchanged**
   - Do not change token storage, OAuth scopes, state signing, callback validation, or database policies.
   - Keep the launcher route for top-level OAuth handoff, but only use it from safe top-level contexts.

5. **Validate**
   - In the live preview, confirm `window.top !== window.self` is detected.
   - Confirm the Connect button opens the published dashboard instead of opening `accounts.google.com` from preview.
   - Confirm the published/top-level flow still uses the Google OAuth launcher.