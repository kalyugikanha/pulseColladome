## Plan

1. **Stop navigating Google inside an embedded preview context**
   - Update the Google Calendar connect flow so OAuth starts from a safe top-level browser window instead of ending up embedded where Google blocks it with `ERR_BLOCKED_BY_RESPONSE`.
   - Keep the existing pre-opened tab approach, but use a small local launcher page/route when needed so the user lands in a normal top-level page before redirecting to Google.

2. **Improve the fallback link behavior**
   - Ensure “Reopen Google sign-in” / popup-blocked fallback also opens from the same safe top-level launcher instead of linking directly to `accounts.google.com` from the app preview.
   - Keep polling the connection state after the launcher opens so the dashboard updates automatically when OAuth completes.

3. **Make the troubleshooting panel explain this exact error**
   - Add a specific item for `accounts.google.com is blocked` / `ERR_BLOCKED_BY_RESPONSE` explaining that Google refuses to load inside embedded frames and that the flow should be opened in a top-level tab/window.
   - Keep the existing guidance for 403, redirect URI mismatch, wrong account, and waiting states.

4. **Preserve existing security and OAuth state handling**
   - Do not change token storage, scopes, state signing, callback validation, or backend permissions.
   - Only adjust the browser-side launch UX and any minimal route needed to safely hand off to Google.

5. **Validate**
   - Use the preview to confirm the Connect/Reconnect button no longer leaves the user on the embedded Google-blocked error page and instead opens a usable top-level OAuth handoff.