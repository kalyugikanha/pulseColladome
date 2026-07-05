## Changes to `src/routes/_authenticated/project-burn.tsx`

### 1. Stacked daily chart by employee
Replace the single-bar-per-day chart with a **stacked bar per day**, one colored segment per employee, plus a legend below.

- Build `dailyTrend` as `{ date, total, perUser: Record<userId, { hours, burn }> }[]` from `filteredDaily` (already reacts to month/project/department).
- Assign each employee a stable color from a small palette (cycled by index of sorted userId list within the current view).
- Render each day column as a vertical flex stack: iterate employees in a stable order, render a segment sized by `(userMetric / maxDailyTotal) * 100%`. Tooltip on each segment shows "Employee — Xh · ₹Y".
- Below the chart, render a legend: small color swatch + employee name + their total hours (and burn if `showCosts`) for the current filter. Employees with 0 in the current view are hidden from the legend.
- Metric: hours when `!showCosts`, burn when `showCosts` (matches existing behavior). Chart title and card description stay as-is.

### 2. Stat cards react to project filter
Currently `totalBurn` / `totalHours` / `activeProjectCount` derive from `deptFilteredDaily` (ignores project filter). Switch them to derive from `filteredDaily` (which already applies project + department + month).

- "Burned this month" → burn on selected project(s).
- "Salary pool" → unchanged (it's a company-wide pool independent of project).
- "Coverage" → `totalBurn / totalSalaryPool` using the project-filtered burn.
- "Hours this month" (non-cost viewers) → hours on selected project.
- "Active projects" → count of distinct project codes in `filteredDaily` (which is 1 when a specific project is chosen, otherwise all).

### 3. Daily log
No changes.

No DB, server function, or other file changes.
