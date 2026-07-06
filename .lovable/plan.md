## Why the gap exists

Four monthly-comp employees have an actual salary this month but logged **zero project hours** in June, so their salary can't be attributed to any project code:

| Employee | Actual salary |
|---|---|
| Akash Jangid | ₹40,000 |
| Chirag Bansal | ₹30,000 |
| Shraddha Saxena | ₹15,000 |
| HEMANTH SRIDHAR | ₹10,000 |
| **Total unallocated** | **₹95,000** |

Actual pool (₹2,87,233) − Unallocated (₹95,000) ≈ Burn shown (₹1,95,233). ✅ The math is right; the display just hides where the missing rupees went.

## Fix — surface the unallocated amount

Single file: `src/routes/_authenticated/finances.tsx`.

1. **New memo `unallocatedByUser`**: for each user in `currentSalaryByUser`, compute `actual - allocated` where `actual` = `monthlyContribByUser.get(uid)` (monthly) or `hourly_rate × hoursLogged` (hourly), and `allocated` = sum of that user's per-project burn from `burnByProject` intermediate. Keep only users with `actual > 0` and `allocated < actual` (typically means 0 project hours).
2. **`totalUnallocated`** memo = sum of the above.
3. **Project burn table**: append a final row **"Unallocated (no project hours)"** with `burn = totalUnallocated`, `hours = 0`, muted styling, shown only when `totalUnallocated > 0`. Include a small `?` tooltip listing the affected employees.
4. **"Total burn" StatCard**: update `sub` from `${totalHours} hrs logged` to `${totalHours} hrs · ${inr(totalUnallocated)} unallocated` when `totalUnallocated > 0`, so `totalBurn + totalUnallocated === Actual salary pool` is visible at a glance.

No changes to burn allocation math itself — burn per project stays proportional to hours logged.

## Scope

- One file: `src/routes/_authenticated/finances.tsx`.
- No schema, server-fn, or data changes.
