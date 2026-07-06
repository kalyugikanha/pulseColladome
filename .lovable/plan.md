## Goal

Subtract approved **unpaid** leave days that fall inside the selected month from each user's effective working days, so the "Actual salary" reflects the deduction.

Example: Anjali on 3 unpaid days in June → `actual = monthly_salary × (effectiveDays − 3) / daysInMonth`.

## Implementation

In `src/routes/_authenticated/finances.tsx`:

1. **Fetch approved unpaid leaves** for the selected month with a new `useQuery` on `leave_requests` filtered by `leave_type = 'unpaid'`, `status = 'approved'`, and date-range overlapping the selected month.

2. **Compute `unpaidDaysByUser: Map<userId, number>`** — for each request, count the number of days that fall within `[monthStart, monthEnd]` (clip `start_date` / `end_date` to the month, inclusive day count).

3. **Update `monthlyContribByUser`** — subtract unpaid days from `effectiveDays` (clamped at 0):
   ```
   payableDays = max(0, effectiveDays - unpaidDaysByUser.get(userId))
   contrib = monthly_salary * payableDays / daysInMonth
   ```

4. **UI hint** — under the Actual salary cell, when unpaid days > 0, show `− N unpaid day(s)` next to the existing "prorated from …" hint.

Top card ("Actual salary pool") picks up the change automatically.

Hourly comp is unaffected (already based on actual clocked hours).

## Scope

Single file: `src/routes/_authenticated/finances.tsx`. No schema or server-fn changes.