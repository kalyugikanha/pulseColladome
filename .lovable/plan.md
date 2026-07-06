## Goal
Pro-rate the "Configured pool" so a salary that becomes effective mid-month only counts for the days it applies to, and any prior salary covers the earlier days of that month.

## Rule
For the selected month with `D` days:
- If a user's latest effective salary started **on or before the 1st of the month** → count the full `monthly_salary` (unchanged).
- If it started **during the month** on day `k` → count `monthly_salary × (D − k + 1) / D` for that salary, plus the **previous** salary (if any, effective before this month) contributes `monthly_salary_prev × (k − 1) / D` for the earlier days.
- Multiple raises inside the same month are handled by summing per-segment contributions across all `salaries` rows whose effective window overlaps the month.
- Hourly comp is already based on hours logged that month — leave it as-is.
- Grants and pending grants have no effective date — leave them as full monthly (unchanged).

## Changes (`src/routes/_authenticated/finances.tsx`)
1. Replace `currentSalaryByUser` (single latest row) with a helper `monthlySalaryFor(userId, month)` that:
   - Sorts that user's `salaries` rows by `effective_from`.
   - Walks day-by-day segments across `[month_start, month_end]`, applying the salary in force on each segment.
   - Returns `{ contribution: number, comp_type: "monthly" | "hourly", hourly_rate: number | null, monthly_salary: number | null, activeAtEnd: Salary | null }`. The `activeAtEnd` field replaces the old "latest salary" lookup for places that only need to know the current comp (salary table row, burn allocation).
2. In `totalConfiguredPool`: for monthly comp use `contribution` directly instead of the full `monthly_salary`. Hourly stays `hourly_rate × hours`.
3. `usersWithSalary`: count users where any salary segment overlaps the month (i.e., `contribution > 0` or `activeAtEnd` set).
4. Burn calculation (`burnByProject`) keeps using `activeAtEnd` so per-project allocation matches the currently-in-force comp — this isn't what the user asked about and won't change.
5. Salary table (Configured salaries card) keeps showing `activeAtEnd` for the current rate.

## Out of scope
- Pro-rating the burn table (only the Configured pool stat is affected).
- Handling salary end-dates / terminations mid-month beyond what `is_active` already excludes.
- UI change to show the pro-ration factor per user (can add later if requested).
