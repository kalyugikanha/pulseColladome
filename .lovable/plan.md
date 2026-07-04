## Goal
Add a collapsible on-screen troubleshooting panel to the Google Calendar connect card that explains common failure modes and gives concrete next steps, so users can self-diagnose when the connect flow doesn't complete.

## Changes (single file: `src/components/google-calendar-connect.tsx`)

1. **New `lastError` state** — capture the message from `handleConnect` / `handleReconnect` / `disconnectMut` failures (currently only toasted) so the panel can display it inline. Cleared when connection status flips to `connected` or a new attempt starts.

2. **New `<GoogleTroubleshootingPanel />` subcomponent** rendered inside both the connected and disconnected cards (basis-full row, below existing content). Structure:
   - Header row: `HelpCircle` icon + "Having trouble connecting?" + a `ChevronDown`/`ChevronUp` toggle. Collapsed by default; expanded state kept in local `useState`.
   - When `lastError` is set, show it at the top in a destructive-tinted box with the raw message and a "Copy details" button (uses `navigator.clipboard`).
   - Expanded body: a list of common issues, each with a short title, one-line explanation, and the fix. Cover:
     - **New tab didn't open** — popup blocker; click "Reconnect" again and allow popups for this site.
     - **Google shows "Access blocked" / 403** — OAuth consent screen not published or account not on test-user list; link to `PUBLISHED_DASHBOARD_URL` and note that preview URLs are often rejected.
     - **"redirect_uri_mismatch"** — the Lovable callback URL isn't in the Google Cloud OAuth client's authorized redirect URIs; show the exact callback path (`/api/public/google/callback` on the current origin) with a copy button.
     - **Stuck on "Waiting for Google authorization…"** — the callback tab was closed before finishing; click Reconnect to try again.
     - **Signed in with wrong Google account** — click Reconnect (which now disconnects first) and pick the correct account on the Google chooser.
     - **Still stuck** — link to Troubleshooting docs (`https://docs.lovable.dev/tips-tricks/troubleshooting`).
   - Small footer line showing the current origin and whether it's the Lovable preview vs published (reuses existing `isLovablePreview`).

3. **Wire error capture**
   - In `openOAuth` catch block: `setLastError(message)` alongside the existing toast.
   - In `disconnectMut.onError`: `setLastError(e.message)`.
   - In the `status?.connected` effect: `setLastError(null)`.

## Out of scope
- No server, OAuth scope, or callback route changes.
- No changes to polling, preview detection, or the existing 403 warning banner (the new panel supersedes it visually but the existing banner stays for at-a-glance guidance).
- No new dependencies; icons come from existing `lucide-react` import.
