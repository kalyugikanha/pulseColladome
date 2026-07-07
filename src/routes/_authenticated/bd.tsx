import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/bd")({ component: BDLayout });

function BDLayout() {
  const { data: me } = useCurrentUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = !!(me?.isAdmin || me?.isSuperAdmin);
  const isManager = isAdmin || !!me?.isReportingManager;

  const tabs: Array<{ to: string; label: string; show: boolean }> = [
    { to: "/bd", label: "My Day", show: true },
    { to: "/bd/team", label: "Team", show: isManager },
    { to: "/bd/recurring", label: "Recurring items", show: isManager },
    { to: "/bd/reports", label: "Reports", show: isManager },
    { to: "/bd/activity-types", label: "Activity types", show: isAdmin },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Business Development</h1>
        <p className="text-sm text-muted-foreground">Daily activity checklist and BD reporting.</p>
      </div>
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.filter((t) => !t.admin || isAdmin).map((t) => {
          const active = t.to === "/bd" ? pathname === "/bd" : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "px-4 py-2 text-sm border-b-2 -mb-px whitespace-nowrap",
                active ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
