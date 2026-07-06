## Plan

The leave row exists and is approved for Sridhar from today through tomorrow, but the app’s authenticated database requests for `leave_requests` are being rejected with a permission error. That is why HR Leave shows `0 total · 0 approved · 0 pending`, and Attendance cannot mark Sridhar as on leave.

### Changes to make

1. **Restore backend table access for signed-in users**
   - Add the missing authenticated access grant on `leave_requests`.
   - Keep existing row-level rules unchanged, so only admins, HR admins, reporting managers, department heads, and the employee’s own scoped views can see the rows they are allowed to see.
   - Add service/admin backend access for the same table.
   - Do **not** grant anonymous public access.

2. **Verify the live flow**
   - Confirm Shraddha/HR Admin and Super Admin queries can read the approved Sridhar leave.
   - Confirm HR Leave day view counts it as `1 total · 1 approved · 0 pending` for today.
   - Confirm Attendance can receive Sridhar’s approved casual leave for today and display him as on leave.

### Technical details

The network response shows:

```text
permission denied for table leave_requests
Hint: GRANT SELECT ON public.leave_requests TO authenticated;
```

Current grants for `leave_requests` are empty, while RLS policies already exist. The migration will add:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;
```

No frontend query change is needed for this specific issue unless verification reveals a separate UI bug after backend access is restored.