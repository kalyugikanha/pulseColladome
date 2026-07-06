## Problem

In June, Actual salary pool = ₹2,87,233 but Total burn = ₹2,01,000. They should match: every rupee of actual salary should be spread across projects in proportion to hours logged.

Root cause in `burnByProject` (src/routes/_authenticated/finances.tsx, lines 165–205):

- For monthly-comp users, the allocation multiplies each user's project-hour share by the **raw `monthly_salary`** — not the pro-rated / unpaid-leave-adjusted amount already computed in `monthlyContribByUser`.
- So a user whose actual salary is ₹2,500 (half-month) still gets ₹5,000 spread across projects, and vice versa. The two totals drift apart.

## Fix

Single file: `src/routes/_authenticated/finances.tsx`.

In the monthly branch of `burnByProject`, replace `Number(salary.monthly_salary ?? 0)` with the user's actual monthly contribution:

```ts
const actual = monthlyContribByUser.get(userId) ?? 0;
alloc = share * actual;
```

Add `monthlyContribByUser` to the `useMemo` dependency array.

Hourly comp stays as `hours × hourly_rate` (unchanged — it's already "actual").

## Result

- `totalBurn` (over all logged projects) equals sum of `monthlyContribByUser` for monthly users who logged any project hours, plus hourly billings — i.e. the Actual salary pool, provided every effective employee logs at least some project hours.
- Card sub-labels/copy unchanged.

## Caveat (surface in the card sub-text)

If a monthly-comp employee logs **zero** project hours in the month, their actual salary cannot be attributed to any project and will be excluded from burn. This is unavoidable without a "general/overhead" bucket. Not changing behavior here — just noting it. If you want, I can also update the "Total burn" card `sub` to show `X of Y salary allocated` so the gap is visible when it exists.

## Scope

- Single edit inside `burnByProject` memo.
- No schema, server-fn, or UI-structure changes.
