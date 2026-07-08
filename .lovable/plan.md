
## Problem

For June the "Proposed salary pool" card shows ₹2,76,000 but adding up the "Proposed salary" column in the table below gives ₹2,96,000 (₹20,000 gap).

Looking at the two calculations:

- **Card total** (`totalProposedPool`) — sums only users who have a row in the `salaries` table.
- **Table row** — shows the salaries value if present, and **falls back to the invite's default salary** (`role_grants.default_monthly_salary`, labelled "(from invite)") when no salaries row exists yet.

Any active employee whose compensation lives only on the invite (no salaries row yet) is displayed in the column but silently dropped from the card total. That is the source of the mismatch, and by construction the card can never be trusted to equal the visible column.

## Fix

Rewrite `totalProposedPool` so it iterates the exact same rows the table renders and adds the exact same number the "Proposed salary" cell shows. In `src/routes/_authenticated/finances.tsx`:

1. For each `p` in `visibleProfiles`:
   - If `currentSalaryByUser.get(p.id)` exists and `comp_type = 'monthly'`, add `monthly_salary`.
   - Else if `comp_type = 'hourly'`, add `hourly_rate * userHoursThisMonth(p.id)` (unchanged).
   - **Else** look up `grantByEmail.get(p.email)` and, mirroring the table:
     - `monthly` grant → add `default_monthly_salary ?? 0`
     - `hourly` grant → add `(default_hourly_rate ?? 0) * userHoursThisMonth(p.id)`
   - "Not set" rows contribute 0 (same as the "—" cell).
2. Keep the existing "active employees only" scope — do not include Pending signup rows in this total (the user confirmed they're excluded).
3. Add a short comment above the memo noting: "Must match the Proposed salary cell in the table below — same fallback order."

No changes to the table rendering, RLS, DB, or any other card.

## Verification

- Open Finances → June, add the Proposed salary column by hand, confirm it equals the card.
- Repeat for a month where at least one active employee has no salaries row but has an invite default; the card should now include that amount.

## Follow-up question I'll ask after the fix ships

If the June total still reads ₹2,76,000 after this change, that means every active June employee already has a salaries row and no invite fallback is contributing — in that case the ₹20,000 you're expecting is coming from a person you believe should be in June that the system doesn't show as active/effective in June. I'll ask you for the name so I can check their `is_active`, `joined_on`, and salary `effective_from`.
