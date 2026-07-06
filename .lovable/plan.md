## Goal
Make the Finances "Configured pool" count only rows from the `salaries` table so it matches the finance sheet.

## Changes (`src/routes/_authenticated/finances.tsx`)

In `totalConfiguredPool`:
- For each visible active profile: include it only when it has an entry in `currentSalaryByUser` (i.e., a real `salaries` row). Monthly comp uses the pro-rated `monthlyContribByUser`; hourly uses `hourly_rate × hours` (unchanged).
- Remove the `grantByEmail` fallback branch — profiles without a salary row no longer contribute.
- Remove the `visiblePendingGrants` addition to the pool — pending signups have no `salaries` row.

Keep the "Pending signups" stat card as-is (still surfaces the count of invited-but-not-registered people from `role_grants`).

Update the sub-labels:
- Configured pool: "salaries table only".
- Employees with salary: unchanged (already counts profiles with a `salaries` row).

## Out of scope
- Removing/rewriting the grants table or the "Pending signups" card.
- Changing the burn calculation.
- Auto-adding missing salary rows — you'll set those via the existing "Set salary" dialog.
