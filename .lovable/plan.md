## Why the two pages disagree

`/finances` uses **actual** per-user salary (pro-rated by `effective_from` and reduced by approved unpaid leave). `/project-burn` still uses the raw `monthly_salary` — no proration, no unpaid-leave deduction. So June:

- Finances burn: ₹1,95,233 (allocated from ₹2,87,233 actual pool)
- Project Burn "Burned this month": ₹2,01,000 (allocated from raw ₹3,82,000 pool)

Same hours, different denominators.

## Fix — align `/project-burn` with `/finances`

Single file: `src/routes/_authenticated/project-burn.tsx`.

1. **Fetch unpaid leaves** for the selected month (same query as finances: `leave_requests` where `leave_type='unpaid'`, `status='approved'`, overlapping the month).
2. **Add `unpaidDaysByUser`** memo — days overlapping the month per user (same math as finances).
3. **Replace `salaryByUser` with `monthlyContribByUser`** — pro-rated: `monthly_salary × max(0, effectiveDays − unpaidDays) / daysInMonth`, where `effectiveDays = daysInMonth − max(0, effectiveFromDay − 1)`.
4. **Update daily-row burn calc** (currently `(h / monthlyHrs) * salary`) to use `monthlyContribByUser` instead of raw `salary`.
5. **Salary pool stat**: keep signed-up sum using pro-rated actual; pending grants stay as raw `default_monthly_salary` (they have no employment period yet), same as today.
6. Note next to the "Burned this month" stat: unchanged text, but value now matches Finances.

## Scope

- One file: `src/routes/_authenticated/project-burn.tsx`.
- Hourly comp isn't modeled in project-burn today (only `monthly_salary` is read); leaving that as-is since the page's data type only exposes `monthly_salary`. Not changing behavior for hourly users on this page.
- No schema, server-fn, or Finances changes.
