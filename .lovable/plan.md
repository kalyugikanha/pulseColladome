## Goal
Add a one-click "Reconnect Google Calendar" button to the connected-state card that disconnects the current Google connection, clears local state, and immediately restarts the OAuth flow in a new tab — all from a single user click so the browser doesn't block the new tab.

## Changes (single file: `src/components/google-calendar-connect.tsx`)

1. **Add `handleReconnect` handler**
   - Guard against double-click via existing `isOpening` state.
   - Open `about:blank` in a `_blank` tab synchronously first (must happen inside the click handler to survive popup blockers).
   - `await disconnect()` server fn to revoke/clear the existing connection row.
   - `await getUrl()` for a fresh Google OAuth URL.
   - `authTab.location.replace(url)` to send the already-open tab to Google. If the tab was blocked, fall back to the existing `popupBlocked` + `pendingUrl` UI.
   - Invalidate `["my-google-status"]` and call `startPolling()` so the card flips to "connected" once callback completes.
   - Toast on failure; if disconnect succeeds but OAuth URL fails, still refresh status so UI reflects the disconnected state.

2. **Connected-state card UI**
   - Replace the single `Disconnect` button with a button group:
     - Primary: `Reconnect` (calls `handleReconnect`, shows `Loader2` + "Reconnecting…" while `isOpening`).
     - Ghost: `Disconnect` (unchanged behavior).
   - Both buttons disabled while `isOpening` or `disconnectMut.isPending`.

3. **State reset**
   - At the start of `handleReconnect`, clear `pendingUrl`, `popupBlocked`, and stop any prior polling so stale UI from a previous attempt doesn't leak through.

## Out of scope
- No changes to server functions, callback route, OAuth scopes, or the disconnected-state card.
- No changes to polling interval, preview detection, or 403 guidance copy.
