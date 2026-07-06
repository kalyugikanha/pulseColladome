
## Why the leave didn't appear for Kanishka

The "Log leave for teammate" dialog inserts the row with `status: 'approved'`, `decided_by = me`, and `decided_at = now()`. That skips the approval queue entirely — Sridhar's leave was already marked approved (and balance deducted) by the super-admin who logged it, so Kanishka never saw a pending item.

## Change

Route every teammate-logged leave through the normal approval chain.

### `src/routes/_authenticated/leave.tsx` — `LogForTeammateDialog.submit()`
- Insert with:
  - `status: 'pending'`
  - remove `decided_by` and `decided_at`
  - keep `reason` populated as `"Logged by <name>: <comment>"` (so the note is visible to the approver in the pending card, since `admin_comment` is the approver's field)
  - drop `admin_comment` from the insert
- Update the helper text in the dialog from "recorded as an approved leave and will deduct from their balance" to "sent for approval to their reporting manager / department head".
- Update the success toast to "Leave submitted for approval".

### No database / RLS changes
The existing INSERT policies for reporting managers, dept heads, and admins already allow inserting pending rows. The existing approval flow (manager / head / admin approve → `handle_leave_status_change` trigger deducts balance) will handle it correctly.

### Not changing
- Self-request flow
- Approval UI
- Balance trigger
- Calendar rendering

### Follow-up note for the user
The existing leave for Sridhar is already in `approved` state. If you want Kanishka to review it, we can either (a) leave it as-is (already counted), or (b) I can flip that specific row back to `pending` after this change ships — tell me which.
