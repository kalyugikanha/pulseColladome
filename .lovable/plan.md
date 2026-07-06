## Goal
Make the Finances "Configured pool" stat reflect only active teammates in the currently selected departments, so June's total matches what's actually being paid out.

## Changes (`src/routes/_authenticated/finances.tsx`)

1. **Load `is_active`** on the profiles query (`profiles` select adds `is_active`) and extend the `Profile` type.
2. **Department + active filter** applied once, reused by all stats:
   - Build `visibleProfiles = profiles.filter(p => p.is_active !== false && (deptSel.size === 0 || deptSel.has(p.department ?? UNASSIGNED)))`.
   - Use `visibleProfiles` (instead of raw `profiles`) inside `totalConfiguredPool`, `usersWithSalary` count, and the "on roster" sub-label.
3. **Pending grants**: only include a pending grant in the pool when either no departments are selected, or the grant's `department` (already selected in the query) is in `deptSel`. Add `department` to the `role_grants` select and `Grant` type.
4. **Inactive teammates never count** in the pool regardless of filter (they're excluded in step 2). Pending grants remain unaffected by active status — they have no profile yet.
5. Keep the salary table below untouched (it already lists everyone; the fix is scoped to the top-line stat the user asked about).

## Out of scope
- Changing the burn calculation, the salary table rendering, or the salaries schema.
- Historical back-dating of `deactivated_at` — active status is evaluated as "currently active".
