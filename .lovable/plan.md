## Problem

When a super admin / HR admin logs a leave for another employee (e.g. Hemanth Sridhar), two things go wrong:

1. The leave sometimes lands as **pending** — the "Pre-approved" checkbox is optional and easy to miss.
2. Even when it is inserted as **approved**, the employee's balance is **not deducted** — `leave_balances.used` stays at 0.

Root cause of #2: the `trg_leave_status_change` trigger is defined `AFTER UPDATE` only, so it never fires for rows inserted directly as `approved`. Confirmed on Hemanth: two approved rows exist, but casual balance still shows `used=0, allocated=5`.

## Fix

### 1. Database trigger + backfill (migration)

- Drop and recreate `trg_leave_status_change` as `AFTER INSERT OR UPDATE`.
- Update `handle_leave_status_change()` so the INSERT branch (`TG_OP='INSERT'` / no OLD) deducts when the new row is `approved`, and the UPDATE branch keeps existing add/subtract logic.
- One-time backfill: for each `leave_balances` row, set `used` = sum of `days` from `leave_requests` where `status='approved'` for that user+type (bounded to `>= 0`). This corrects Hemanth's row and any other historically approved rows that missed the deduction.

### 2. HR "Log leave" dialog (`src/routes/_authenticated/hr.leave.tsx`)

- Remove the "Mark as pre-approved" checkbox and the `preApproved` state.
- Always insert with `status='approved'`, `admin_comment='Logged by HR/Super Admin'`, `decided_at=now()`.
- Toast copy: "Leave logged and approved — balance updated".

No other surfaces change; the regular employee request flow still goes through pending → approved.

## Verification

- Log a fresh leave for a test employee → row is `approved`, `leave_balances.used` increases by `days` immediately.
- Re-check Hemanth: casual `used` reflects previously approved days after backfill.
