## Goal
Fix the Google Calendar connection error, then build a team calendar utility where employees can sync their calendars, view teammates’ blocked time/work context, and book time on a shared team calendar.

## Immediate OAuth fix
1. Update the Calendar OAuth callback to use the exact published callback URL Google is rejecting unless configured:
   - `https://colladome-pulse.lovable.app/api/public/google/callback`
2. Make the app surface a clear setup screen when Google returns `redirect_uri_mismatch`, including the exact values to add in Google Cloud:
   - Authorized redirect URI: `https://colladome-pulse.lovable.app/api/public/google/callback`
   - Authorized JavaScript origin: `https://colladome-pulse.lovable.app`
3. Verify the app is consistently using the same callback URL for both:
   - the initial Google auth URL
   - the code-to-token exchange
4. Fix the current `/auth` hydration mismatch quietly while touching auth-related routes.

## Google Cloud action you still need to do
No personal auth token is needed and you should not paste Google access tokens into chat. The required Google-side setup is:
1. In the same Google Cloud project as the saved Client ID/Secret, open the OAuth Client ID used by this app.
2. Add this exact Authorized redirect URI:
   `https://colladome-pulse.lovable.app/api/public/google/callback`
3. Add this Authorized JavaScript origin:
   `https://colladome-pulse.lovable.app`
4. Enable Google Calendar API in that Google Cloud project.
5. OAuth consent screen:
   - If Testing: add every employee Google account as a test user.
   - For org-wide usage: publish the consent screen or configure it as internal for your Google Workspace.
6. Calendar scopes needed:
   - `openid`
   - `email`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - for booking shared calendar events, also add `https://www.googleapis.com/auth/calendar.events`

## Team calendar sync utility
1. Extend Google Calendar OAuth scopes from read-only to event booking:
   - keep read access for availability/work visibility
   - add event write access for creating bookings on the shared team calendar
2. Add secure backend tables for:
   - each employee’s synced calendar connection
   - cached/sanitized calendar events
   - shared team calendar bookings
   - sync status/errors per employee
3. Add server functions to:
   - sync the signed-in employee’s calendar events
   - refresh expired Google access tokens safely
   - list visible team availability across departments
   - create a booking on the shared team calendar
4. Add UI to the dashboard/calendar area:
   - “Sync my calendar” status card
   - team availability timeline/day view
   - teammate filters by department/person
   - booking form for team shared calendar slots
   - clear connected/error states
5. Privacy behavior:
   - show time blocks and work context where available
   - avoid exposing private event descriptions by default
   - show enough information for team planning without leaking sensitive personal details

## Technical notes
- Tokens stay server-side only in the backend.
- Employees never enter or share Google auth tokens manually.
- Existing saved `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` remain the only app secrets needed unless they belong to the wrong OAuth client.
- If the OAuth client was edited, connected users may need to reconnect once so Google grants the new calendar event scope.

## Validation
1. Open published `/google-calendar-connect`.
2. Confirm Google no longer shows `redirect_uri_mismatch` after the Google Cloud redirect URI is added.
3. Connect one employee account.
4. Sync events and confirm they appear in the team calendar view.
5. Create a test booking on the shared calendar and confirm it appears in Google Calendar.