import { createFileRoute, useRouterState, useNavigate } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCurrentUser } from "@/hooks/use-current-user";
import { CalendarRange, CalendarDays, IdCard, Users } from "lucide-react";
import { LeavePage } from "./leave";
import { CalendarPage } from "./calendar";
import { DirectoryPage } from "./directory";

type Tab = "leave" | "calendar" | "directory";

export const Route = createFileRoute("/_authenticated/team")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => {
    const t = s.tab;
    return { tab: t === "leave" || t === "calendar" || t === "directory" ? t : undefined };
  },
  component: TeamHub,
});

function TeamHub() {
  const { data: me } = useCurrentUser();
  const search = useRouterState({ select: (s) => s.location.search }) as { tab?: Tab };
  const navigate = useNavigate({ from: "/team" });

  if (!me) return <div className="text-muted-foreground">Loading…</div>;

  const canSeeDirectory = me.isSuperAdmin || me.isHrAdmin || me.isDepartmentHead || me.isReportingManager;
  const tab: Tab = search.tab ?? "leave";
  const setTab = (t: Tab) => navigate({ search: { tab: t }, replace: true });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Users className="h-7 w-7 text-primary" /> Team</h1>
        <p className="text-sm text-muted-foreground mt-1">Leave requests, team calendar{canSeeDirectory ? ", and the employee directory." : "."}</p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="leave"><CalendarRange className="h-4 w-4 mr-1" /> Leave</TabsTrigger>
          <TabsTrigger value="calendar"><CalendarDays className="h-4 w-4 mr-1" /> Calendar</TabsTrigger>
          {canSeeDirectory && <TabsTrigger value="directory"><IdCard className="h-4 w-4 mr-1" /> Directory</TabsTrigger>}
        </TabsList>

        <TabsContent value="leave" className="mt-4"><LeavePage /></TabsContent>
        <TabsContent value="calendar" className="mt-4"><CalendarPage /></TabsContent>
        {canSeeDirectory && <TabsContent value="directory" className="mt-4"><DirectoryPage /></TabsContent>}
      </Tabs>
    </div>
  );
}
