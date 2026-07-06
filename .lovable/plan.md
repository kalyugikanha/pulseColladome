## Changes to `/finances`

### 1. Hide employees not yet effective in the selected month

An employee (profile or pending invite) is "effective in month M" when their **earliest salary `effective_from` (or, if no salary row yet, their profile `joined_on` / role_grant hint) is on or before the last day of M**. Currently the Salaries table and top cards include Sohil (joined July 1) and Shweksha (joined July 6) when June is selected.

- Load `joined_on` for profiles (already read via `select` — add the column).
- Compute `earliestEffectiveByUser` = min(`salaries.effective_from`) per user; if none, use `profiles.joined_on`.
- Filter both the **Salaries table rows** and the **top-card counts / totals** to only include profiles where `earliestEffective <= last day of selected month`.
- Same treatment for `pendingGrants`: skip a grant if its matched profile (by email) isn't effective yet, or — for grants with no profile — hide until the invite has a `joined_on` or salary in-range (grants have no join date, so keep the current behavior: show them only when the current month is `>=` today's month — i.e. hide pending invites for past months).

### 2. Replace "Rate" with "Proposed salary" + "Actual salary"; reorder columns

New Salaries table columns, left→right:

`Employee | Email | Status | Type | Effective from | Proposed salary | Actual salary`

- **Proposed salary** = the raw configured amount for the effective salary row (or from the invite grant when pending): monthly amount, or `<rate>/hr` for hourly comp. Same value the current "Rate" cell shows.
- **Actual salary** = pro-rated for the selected month:
  - **Monthly comp**: walk each day of the selected month, sum `monthly_salary / daysInMonth` for the days the salary was active (already computed in `monthlyContribByUser` — reuse it). If salary starts mid-month (e.g. Manvi June 15), this naturally yields `monthly_salary * 16/30`.
  - **Hourly comp**: `hours logged that month × hourly_rate` (reuse existing `userHoursThisMonth`).
  - Pending grants with no salary row yet: show `—` (nothing accrued).
- Show a small `(prorated from <effective_from>)` hint under Actual when the salary started inside the selected month.

### 3. Update top cards to use "actual" numbers

- **Configured pool** → rename to **"Actual salary pool"**; keep the current pro-rated math (`monthlyContribByUser` + hourly billed hours), but restrict the sum to the effective-in-month roster from step 1.
- **Employees with salary** and **on roster** counts also use the effective-in-month roster and effective-in-month pending grants.
- Total burn card unchanged (already driven by logs in-month).

### 4. Files touched

- `src/routes/_authenticated/finances.tsx` — add `joined_on` to the profiles query; add `earliestEffectiveByUser` memo + `isEffectiveInMonth` helper; filter `visibleProfiles` / `visiblePendingGrants` / Salaries table by it; reorder columns and add Actual salary cell; rename Configured pool card.

No schema changes, no server-fn changes.
