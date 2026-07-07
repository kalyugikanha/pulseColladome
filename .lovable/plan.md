## Plan

1. **Wipe current punch data before the code fix**
   - Delete all rows from `punch_sessions` and `attendance_logs` using a backend migration so production starts clean after deployment.
   - Re-check counts after migration so both tables are empty.

2. **Move punch-in/punch-out writes to server-side functions**
   - Replace direct browser inserts/updates for punch sessions with authenticated server functions.
   - Server function will always use the logged-in user's real backend identity, not UI/view-as state.
   - On punch-in, if an open session already exists, return that session instead of throwing a duplicate error, so the UI can immediately switch to Punch Out.
   - On punch-out, update only the current user’s open session and let the database sync attendance.

3. **Harden dashboard and Punch In/Out page UI state**
   - Dashboard and Punch page will refetch the latest session immediately after punch-in/out and on focus/mount.
   - If the backend reports an existing open session, both screens will display “Punch out” instead of leaving the user stuck on “Punch in”.
   - Remove client-side attendance rollup code from punch-out; the database trigger is already responsible for attendance sync.

4. **Fix HR attendance visibility consistency**
   - Ensure Attendance queries read live open sessions as the source of “Punched in”.
   - Add focus/mount refetch for Attendance overview so HR sees production users’ current status after deployments or tab refreshes.

5. **Double-check backend safety**
   - Confirm the punch sync trigger and one-open-session-per-user protection remain in place.
   - Confirm access policies still allow users to manage only their own punch sessions while HR/admin/manager roles can view the appropriate team data.

6. **Verify after implementation**
   - Confirm both punch tables are empty after reset.
   - Test the flow: Dashboard Punch In → button changes to Punch Out → Punch page shows active timer → Attendance overview shows Punched in.
   - Test duplicate-click/reload behavior so a second click or fresh incognito tab does not create a stuck “already punched in but button says Punch in” state.