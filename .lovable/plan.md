## Leave — create on behalf of reports

### Database migration
Add INSERT policies on `public.leave_requests` so managers/heads can log leave for their people:

```sql
CREATE POLICY "leave: reporting manager create"
  ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (private.is_reporting_manager_of(auth.uid(), user_id));

CREATE POLICY "leave: dept head create"
  ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (private.is_head_of_user(auth.uid(), user_id));
```
(Admins/super-admins already covered by `leave: admin manage`.)

No trigger change needed — `handle_leave_status_change` already decrements/increments balances when `status = 'approved'`.

### UI — `src/routes/_authenticated/leave.tsx`
- Fetch "manageable users" via a small helper query:
  - if `me.isAdmin` → all active profiles
  - else → union of `profiles.reporting_manager_id = me.id` and everyone in the departments where `me.id` appears in `department_heads`
- Show a new "Log leave for teammate" button (visible when the list is non-empty) next to the existing "Request leave".
- Dialog fields:
  - Employee (searchable Select of manageable users)
  - Leave type (casual / sick / earned / unpaid — same TYPES list)
  - Start date, End date (auto-compute `days`)
  - Comment (stored in `admin_comment`; also mirrored into `reason` for context)
- Insert row with: `user_id = picked`, `status = 'approved'`, `decided_by = me.id`, `decided_at = now()`, `admin_comment = comment`, `reason = "Logged by manager"`.
- Toast success + invalidate leave / calendar queries.

### Files touched
- New migration under `supabase/migrations/`.
- `src/routes/_authenticated/leave.tsx` — add manageable-users query, new dialog component, wire button.

### Not changing
- Self-request flow, balances, approval flow, calendar rendering — all untouched.
