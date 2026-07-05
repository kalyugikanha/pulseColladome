import type { CurrentUser } from "./use-current-user";

/**
 * Client-side visibility scoping for management screens.
 *
 * Admin, super admin, HR admin, finance admin, and project managers are unscoped.
 * Otherwise a viewer sees the INTERSECTION of:
 *   - their reporting-manager scope (direct reports + themselves), if any
 *   - their department-head scope (their headed departments), if any
 *
 * `deptScope` is a list of department names to filter `profiles.department` on.
 * `userScope` is a list of user ids to filter `profiles.id` / `*.user_id` on.
 * `isUnscoped` is true when the viewer should see everyone (admin/PM/HR path).
 */
export type VisibilityScope = {
  deptScope: string[] | null;
  userScope: string[] | null;
  isUnscoped: boolean;
};

export function getVisibilityScope(me: CurrentUser | null | undefined): VisibilityScope {
  if (!me) return { deptScope: null, userScope: null, isUnscoped: false };
  const unscoped = me.isAdmin || me.isSuperAdmin || me.canManageProjects || me.isHrAdmin || me.isFinanceAdmin;
  if (unscoped) return { deptScope: null, userScope: null, isUnscoped: true };
  const deptScope = me.isDepartmentHead && me.headOfDepartments.length ? me.headOfDepartments : null;
  const userScope = me.isReportingManager
    ? Array.from(new Set([...(me.directReportIds ?? []), me.id]))
    : null;
  return { deptScope, userScope, isUnscoped: false };
}

export function useVisibilityScope(me: CurrentUser | null | undefined): VisibilityScope {
  return getVisibilityScope(me);
}
