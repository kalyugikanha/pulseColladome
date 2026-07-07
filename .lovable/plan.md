## Plan

1. **Fix the backend permission error**
   - Add a backend migration granting logged-in users permission to execute the reporting helper functions used by access rules:
     - `private.is_in_reports_tree`
     - related private role/reporting helpers already used in policies, so the same issue does not repeat on nearby pages.
   - Keep the functions private and security-definer; this only allows the existing access rules to call them, it does not expose table data by itself.

2. **Restore Data API table grants for the affected tables**
   - Add explicit logged-in-user access grants for:
     - `punch_sessions`
     - `attendance_logs`
     - `leave_requests`
   - Add service-role access grants for the same tables.
   - Do not add anonymous access because these are employee attendance/leave records.

3. **Double-check policies stay restrictive**
   - Keep existing row-level rules intact:
     - users only see/manage their own punch/attendance rows,
     - HR/admin see team-wide rows,
     - reporting managers see rows in their reporting tree.

4. **Verify after migration**
   - Confirm `authenticated` can execute `private.is_in_reports_tree`.
   - Confirm the affected tables have explicit logged-in access grants.
   - Run the backend linter and review any security warnings related to this fix.

5. **Production outcome**
   - Kanishka and other reporting/HR users should stop seeing `permission denied for function is_in_reports_tree` when opening Attendance or punch-related views.
   - Punch-in state should be able to load correctly instead of failing while checking team/reporting access.