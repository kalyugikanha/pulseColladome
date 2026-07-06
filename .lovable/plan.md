## Plan

1. **Move HR leave logging into a server function**
   - Add a protected backend function for “log leave for employee”.
   - Gate it to super admin / HR admin only.
   - Accept employee, leave type, dates, days, and note.

2. **Resolve placeholder profile IDs before inserting**
   - When the selected profile has no matching auth account, find the real auth user by email.
   - If a real auth user exists, use that auth user ID for `leave_requests.user_id` instead of the placeholder profile ID.
   - Also make sure the real profile row exists and has the employee details, so the leave appears under the right person.

3. **Handle missing accounts clearly**
   - If no backend auth account exists for that employee email, return a clear message like: “This employee account is not synced yet. Run Sync missing accounts from Access first.”
   - This avoids the raw foreign key error.

4. **Update the HR Leave UI**
   - Replace the direct browser insert into `leave_requests` with the new server function call.
   - Keep the existing form and success behavior unchanged.

5. **Verify Anjali’s case**
   - Confirm the current selected Anjali row is the placeholder profile ID.
   - After implementation, test logging 3 unpaid days in June and confirm the request is created without the foreign key error.