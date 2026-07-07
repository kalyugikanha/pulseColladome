import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CurrentUser } from "./use-current-user";

/**
 * Client-side visibility scoping for management screens.
 *
 * Admin, super admin, HR admin, finance admin, and project managers are unscoped.
 * Everyone else sees only themselves + their full reporting tree
 * (direct + indirect reports). Department-Head is NOT a visibility grant.
 *
 * `userScope` is a list of user ids to filter `profiles.id` / `*.user_id` on.
 * `isUnscoped` is true when the viewer should see everyone (admin/PM/HR path).
 */
export type VisibilityScope = {
  deptScope: string[] | null; // kept for backwards compat; always null now
  userScope: string[] | null;
  isUnscoped: boolean;
};

export function getVisibilityScope(me: CurrentUser | null | undefined): VisibilityScope {
  if (!me) return { deptScope: null, userScope: null, isUnscoped: false };
  const unscoped = me.isAdmin || me.isSuperAdmin || me.canManageProjects || me.isHrAdmin || me.isFinanceAdmin;
  if (unscoped) return { deptScope: null, userScope: null, isUnscoped: true };
  const userScope = me.isReportingManager
    ? Array.from(new Set([...(me.directReportIds ?? []), me.id]))
    : [me.id];
  return { deptScope: null, userScope, isUnscoped: false };
}

/**
 * Adds the indirect reporting descendants for managers on top of the basic
 * scope, using client-side BFS via `profiles.reporting_manager_id`.
 * The recursive walk relies on RLS letting a manager read profiles under
 * their tree (or being unscoped).
 */
export function useVisibilityScope(me: CurrentUser | null | undefined): VisibilityScope {
  const base = getVisibilityScope(me);
  const seeds = me?.directReportIds ?? [];
  const enabled = !!me && !base.isUnscoped && seeds.length > 0;

  const { data: tree } = useQuery<string[]>({
    queryKey: ["reports-tree", me?.id],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const seen = new Set<string>(seeds);
      let frontier = seeds.slice();
      while (frontier.length) {
        const { data } = await supabase
          .from("profiles")
          .select("id")
          .in("reporting_manager_id", frontier);
        const next: string[] = [];
        for (const row of (data ?? []) as Array<{ id: string }>) {
          if (!seen.has(row.id)) { seen.add(row.id); next.push(row.id); }
        }
        frontier = next;
      }
      return Array.from(seen);
    },
  });

  if (base.isUnscoped || !me) return base;
  const merged = new Set<string>([me.id, ...(tree ?? seeds)]);
  return { deptScope: null, userScope: Array.from(merged), isUnscoped: false };
}
