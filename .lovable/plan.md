## Problem

For Manvi (and Trisha), the salary is ₹5,000/month effective **2026-06-15**, but the June "Actual salary" shows the full ₹5,000 instead of the expected ~half.

## Root cause

`monthlyContribByUser` in `src/routes/_authenticated/finances.tsx` walks every day of the month and, for each day, picks whichever salary row was active that day. If the user has an **earlier salary row** (e.g. a previous ₹5,000 record effective before June), days 1–14 are paid from the old row and days 15–30 from the new one — so the month total still adds up to ₹5,000. The "prorated from 2026-06-15" hint is shown based only on the newest row's date, hiding the fact that the earlier row is filling in the pre-15 days.

The top card ("Actual salary pool") uses the same map and inherits the same bug.

## Fix

Change the proration so it uses **only the currently-effective salary** (the newest row with `effective_from ≤ monthEnd`), prorated across the days it actually covers within the selected month:

```text
effectiveDays = daysInMonth - max(0, day_of_month(effective_from) - 1)   // if effective_from is in this month
             = daysInMonth                                                // if effective_from is before this month
actual = monthly_salary * effectiveDays / daysInMonth
```

For Manvi in June: `5000 * 16 / 30 ≈ ₹2,666.67`. If she had no earlier row this already matched; with an earlier row it now correctly ignores it.

Hourly comp is unchanged (hours × rate).

## Scope

Single file:
- `src/routes/_authenticated/finances.tsx` — rewrite the `monthlyContribByUser` memo to use only `currentSalaryByUser.get(userId)` and prorate from its `effective_from`. Everything downstream (Salaries table "Actual salary" cell, "Actual salary pool" top card) picks up the fix automatically.

No schema, server-fn, or UI-structure changes.