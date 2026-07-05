## Summary
Apply one consistent visibility rule across every management screen: **a viewer sees the intersection of their reporting-manager scope and their department-head scope**. Extend the same employee filter (from Project Burn) to Timesheet.

## The shared scoping rule (helper)
For a viewer who is **not** admin and **not** project manager, build:

```
reporteeScope = isReportingManager ? [...directReportIds, self.id] : null
deptScope     = isDepartmentHead   ? headOfDepartments             : null
```

Then when fetching profiles:
- If both scopes exist → `WHERE department IN deptScope AND id IN reporteeScope` (intersection).
- If only one exists → apply just that one.
- If neither → no client-side scope (admin/PM path).

Attendance-log / task queries follow with `.in("user_id", visibleUserIds)` where `visibleUserIds` are the profile ids that passed the scope.

To keep this consistent, add a small helper to `src/hooks/use-current-user.ts` (or a sibling util):

```ts
export function useVisibilityScope(me) {
  // returns { deptScope: string[] | null, userScope: string[] | null, isUnscoped: boolean }
}
```

Every page below uses it instead of hand-rolling the branches.

## Pages to update
1. **`/timesheet`** (`src/routes/_authenticated/timesheet.tsx`)
   - Replace the current `deptScope`/`reporteeScope` branches with the helper (intersection).
   - Add an **Employee** `MultiSelectFilter` (options = visible users, value = user id) and apply it to `filteredUsers`, drill-downs, day view, totals, and CSV export.

2. **`/attendance`** (`src/routes/_authenticated/attendance.tsx`)
   - Currently only applies `pureHead` when the viewer is a dept head AND not a reporting manager, and leans on RLS for RMs. Switch to the helper so the intersection works for viewers who are both, and so the RM scope is always applied client-side too (RLS remains the source of truth).

3. **`/tasks-overview`** (`src/routes/_authenticated/tasks-overview.tsx`)
   - Today, the initial-filter effect sets *either* departments (dept-head-only) *or* employees (reporting-manager). For someone who is both, that collapses to just their reports, ignoring department. Change it to seed **both** filters when both roles apply, so results are `reports ∩ marketing`.

4. **`/project-burn`** (already in the earlier plan)
   - Same helper; keep the employee filter addition.

5. **`/directory`** (`src/routes/_authenticated/directory.tsx`)
   - Currently fetches all profiles. Apply the helper's `deptScope`/`userScope` so a reporting manager sees only their reports, a dept head sees their department, and someone who is both sees the intersection. Admin/HR/PM/super-admin remain unscoped.

## Not changing
- RLS policies (still the security boundary).
- `/my-timesheet` (personal view).
- Admin-only pages (`admin.taxonomy`, `task-templates`) — viewer is already admin.

## Behavior after the change
- **Kanishka** (Marketing head + RM): Attendance, Timesheet, Tasks Overview, Project Burn, Directory all show only her direct reports who are in Marketing.
- **Akash** (RM only): all screens show only Arpit (his direct report) + himself where relevant.
- Pure department head, admin, and project manager: unchanged.