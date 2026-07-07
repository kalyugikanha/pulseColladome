## Plan: stabilize punch-in production behavior

### What I found
- Punch-in currently writes to `punch_sessions`, then separately writes/updates `attendance_logs` from the browser.
- Dashboard, Attendance, and HR views mostly read `attendance_logs`, not `punch_sessions`.
- In production right now there are many open rows in `punch_sessions`, but only a few matching open rows in `attendance_logs`. That explains why users can appear “punched in” in one place but HR/dashboard timers do not reflect it.
- The punch page only recalculates elapsed time when data/dialog state changes, so an open session can show but the live time does not keep ticking.
- Deployment should not affect active punch sessions if the source of truth is durable backend data instead of local UI/cache state.

### Fix strategy
1. **Make backend punch data authoritative**
   - Add database logic so every punch-in automatically creates/updates the user’s daily attendance row.
   - Add database logic so every punch-out automatically updates punch-out time and total hours on the daily attendance row.
   - This makes HR Attendance, Dashboard, and the Punch page consistent even if a deployment happens mid-session.

2. **Repair current production mismatch**
   - Backfill today’s `attendance_logs` from existing open/closed `punch_sessions` so users who punched in ~30 minutes ago immediately show correctly to HR.
   - Preserve their original punch-in time from the existing session; do not reset it to the deployment time.

3. **Harden the Punch page UI**
   - Query open sessions from `punch_sessions` as the source of truth.
   - Add a real ticking timer for the currently open session.
   - Prevent double-click/double-submit while punch-in is being saved.
   - After punch-in/out, invalidate the dashboard, attendance, punch history, and punch session queries so all screens refresh.

4. **Fix Dashboard and HR Attendance reads**
   - Ensure Dashboard status uses the durable open session / synced attendance row and cannot get stuck after deployment.
   - Ensure HR Attendance derives “Punched in” correctly for users with an active `punch_sessions` row, even before any client cache updates.

5. **Add a regression guard in code structure**
   - Centralize punch/attendance rollup behavior instead of keeping separate one-off browser updates.
   - Keep the punch-in module resilient to future frontend deployments because active sessions remain in the backend and roll up automatically.

### Technical details
- Use a Lovable Cloud database migration for trigger/function changes and today’s safe backfill.
- Update `src/routes/_authenticated/punch.tsx` for live timer and click-state handling.
- Update `src/routes/_authenticated/dashboard.tsx` and `src/routes/_authenticated/attendance.tsx` so open session state is shown consistently.
- No auth or role broadening is planned beyond the existing HR visibility rules.