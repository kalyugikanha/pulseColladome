## Goal
Enable Admin / HR Admin to fully modify any employee's leave from the HR Admin → Leaves module — not just approve/reject.

## Current state
- `hr.leave.tsx` Requests tab lets admins Approve / Reject / flip status via a direct `supabase.from("leave_requests").update(...)` call.
- No way to edit dates, type, days, reason, or delete a leave.
- Log-leave dialog only creates new approved leaves via `logLeaveForEmployee` server fn.

## Changes

### 1. New server fns in `src/lib/admin-users.functions.ts`
Both gated on `isSuper || hr_admin` (same guard used by `logLeaveForEmployee`) and executed via `supabaseAdmin` so balance triggers run with full privileges.

- `updateLeaveForEmployee({ id, leave_type?, start_date?, end_date?, days?, reason?, status?, admin_comment? })`
  - Validates dates / days when supplied.
  - Updates the row; sets `decided_by = context.userId`, `decided_at = now()` when status changes.
  - Existing `handle_leave_status_change` trigger keeps `leave_balances.used` in sync automatically.
- `deleteLeaveForEmployee({ id })`
  - Deletes the row (trigger reverses balance if it was approved).

### 2. HR Leaves UI — `src/routes/_authenticated/hr.leave.tsx`
In `RequestsTable`, replace the current per-row action row with:
- **Edit** button → opens an `EditLeaveDialog` prefilled with the row (employee shown read-only, editable: type, start, end, reason, status, admin comment; days auto-recomputed from dates).
- Keep **Approve / Reject** quick actions for pending rows.
- Add **Delete** button with a confirm.
- All actions call the new server fns, then `qc.invalidateQueries()` so Day / Timeline / Requests all refresh.

Also add the same Edit / Delete affordance from the **Day view** row cards (small pencil / trash icon) so admins can act on today's leaves without switching tabs.

### 3. No schema changes
`leave_requests` already has all needed columns and the balance trigger.

## Files touched
- `src/lib/admin-users.functions.ts` — add two server fns.
- `src/routes/_authenticated/hr.leave.tsx` — new `EditLeaveDialog`, wire Edit/Delete in Requests + Day view.
