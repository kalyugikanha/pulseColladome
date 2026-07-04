
## Goal
Every team member connects their own Google Calendar once. A new **Team Calendar** tab lets super admins pick any user and see their next 7 days of meetings.

## Prerequisites (you provide)
Google Calendar API is NOT available through the Lovable connector for other users' data — the connector only reads the developer's own account. Per-user OAuth requires **your own Google Cloud OAuth client**:

1. In [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Enable **Google Calendar API**.
2. OAuth consent screen → External, add scope `https://www.googleapis.com/auth/calendar.readonly`, add all team member emails as test users (or publish the app).
3. Credentials → Create OAuth Client ID → Web application. Authorized redirect URI: `https://colladome-pulse.lovable.app/api/public/google/callback` (and the preview URL equivalent).
4. Give me the **Client ID** and **Client Secret** — I'll store them as secrets `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.

## Database
New migration:

- Table `public.google_calendar_tokens`
  - `user_id uuid PK` → `auth.users(id)` on delete cascade
  - `google_email text`
  - `access_token text`, `refresh_token text`, `expires_at timestamptz`
  - `scope text`, `connected_at`, `updated_at`
  - GRANTs: `authenticated` may `SELECT` own row only; `service_role` full.
  - RLS: user reads own row; super admins read all (via `is_super_admin`); writes restricted to service role (edge/server fns).

## Server routes / functions (`src/lib/google-calendar.*`)
- `GET /api/public/google/start` — signed-in user hits this; generates OAuth URL with `state` = signed user id, redirects to Google.
- `GET /api/public/google/callback` — exchanges code, stores tokens (service role), redirects back to `/team-calendar?connected=1`.
- `disconnectGoogleCalendar` server fn — deletes caller's row.
- `getMyGoogleStatus` server fn — returns `{ connected, google_email }` for current user.
- `listUserUpcomingEvents({ userId, days=7 })` server fn (super-admin only):
  - Verifies caller `is_super_admin`.
  - Loads target user's tokens (service role); refreshes if `expires_at < now()`.
  - Calls `GET https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=…&timeMax=…&singleEvents=true&orderBy=startTime`.
  - Returns normalized events: `id, summary, start, end, attendees[], meeting_link, organizer`.
- `listTeamGoogleStatuses` server fn (super-admin only): returns each profile + `{ connected, google_email }` for the picker.

## UI
1. **Connect banner on Dashboard** for every user — if not connected, shows "Connect Google Calendar" button (opens `/api/public/google/start` in a new tab, polls status). Once connected: shows email + Disconnect.
2. **New route `/team-calendar`** in the sidebar (super-admin only, gated like existing admin nav):
   - Left: user selector (searchable Select of team members, badge showing connected/not).
   - Right: header "Next 7 days" + list of events grouped by day, each card showing time range, title, attendees count, and Meet/Zoom link if present.
   - Empty states for "not connected" and "no upcoming events".
   - Refresh button.

## Sharing
The "share" here means the super-admin can select any individual user and view their calendar in the same Team Calendar tab — no external sharing/export in this pass.

## Out of scope (this pass)
- Editing/creating events, responding to invites, cross-user overlap views, month grid overlay onto existing Team Calendar page, notifications.

## Technical notes
- Redirect URIs must be added in Google Cloud for both preview and published domains.
- Refresh flow uses `grant_type=refresh_token`; if Google returns `invalid_grant`, mark user disconnected and prompt reconnect.
- All Google API calls happen server-side; tokens never reach the browser.
- Rate: super-admin list view fetches one user at a time (on selection), not all users in parallel.
