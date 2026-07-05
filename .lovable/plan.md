## View-as doesn't reflect Kanishka's Department Head status

You're signed in as Shubham (super admin) using "view as Kanishka". The sidebar's Admin section is hidden because `useCurrentUser` overrides admin/finance/HR/PM flags for the impersonated user, but **`isDepartmentHead` is always computed from the real signed-in user's `department_heads` rows** — Shubham has none, so it stays `false`, and the whole Admin group hides.

### Fix

In `src/hooks/use-current-user.ts`, inside the `viewingAs` branch:

- Also fetch `department_heads` for the impersonated user.
- Override `headOfDepartments` and `isDepartmentHead` from that result (falling back to the real user's rows when not impersonating).

That's the only change needed. The rest of the sidebar/page gates already honor `isDepartmentHead`, so after the flag flips true you'll see Team, Hours Editor, Timesheet, Task Overview, and Task Templates as Kanishka.

### Note on data queries (not fixed by this)

"View as" only re-labels the UI; server queries still run under Shubham's RLS (super admin sees all). Personal widgets on the dashboard (my tasks, my leave balance) still filter by Shubham's `user.id`. Once we're moving to production you'll sign in as Kanishka directly to see her real filtered data — no further code change needed for that.

### Verification

Refresh with view-as Kanishka. Left sidebar shows the Admin group with Team / Hours Editor / Timesheet / Task Overview / Task Templates. Opening any of them loads without redirecting to /dashboard.
