## Project Burn for department heads — hours-only view

Kanishka can see the sidebar link but the page early-returns because she isn't a finance admin, and every query is gated on `me.isFinanceAdmin`. Plan: let department heads render the page with cost columns hidden and data scoped to their department members.

### Changes (single file: `src/routes/_authenticated/project-burn.tsx`)

1. **Remove the finance-only redirect**. Allow either `me.isFinanceAdmin` or `me.isDepartmentHead`. Redirect only when neither is true.
2. **Enable queries** for both roles (change every `enabled: !!me?.isFinanceAdmin` to `!!me && (me.isFinanceAdmin || me.isDepartmentHead)`). Skip the `salaries` and `role_grants` queries entirely for non-finance viewers.
3. **Scope profiles / logs** to `me.headOfDepartments` when the viewer is a department head (not finance). Finance keeps the full org view.
4. **Hide cost columns and totals** for non-finance viewers: hide any column showing INR, hourly rate, salary, cost-per-project, cost totals, and the "monthly burn (₹)" summary card. Keep hours per project, hours totals, project selector, and department filter.
5. **Header copy** switches to something like "Project hours by teammate — <Department>" when finance is hidden, so it's obvious what she's looking at.

No RLS or backend changes — cost tables stay finance-only, so even a hand-crafted request from her session returns nothing.

### Verify

- View as Kanishka → /project-burn loads, shows 5 Marketing teammates, per-project hours grid, no INR anywhere.
- View as Shubham (super/finance admin) → same page still shows salaries and INR burn totals as before.
