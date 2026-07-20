import { createFileRoute, useRouterState, useNavigate } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Clock, TableProperties, Users } from "lucide-react";
import { PunchPage } from "./punch";
import { MyTimesheetPage } from "./my-timesheet";
import { TimesheetPage } from "./timesheet";
import { AttendanceTeamPanel } from "@/components/hubs/attendance-team-panel";

type Tab = "my" | "timesheet" | "team-timesheet" | "team";

export const Route = createFileRoute("/_authenticated/attendance")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => {
    const t = s.tab;
    return { tab: t === "my" || t === "timesheet" || t === "team-timesheet" || t === "team" ? t : undefined };
  },
  component: AttendanceHub,
});

function AttendanceHub() {
  const { data: me } = useCurrentUser();
  const search = useRouterState({ select: (s) => s.location.search }) as { tab?: Tab };
  const navigate = useNavigate({ from: "/attendance" });

  if (!me) return <div className="text-muted-foreground">Loading…</div>;

  const canSeeTeamTimesheet = me.canManageProjects || me.isDepartmentHead || me.isReportingManager || me.isAdmin || me.isSuperAdmin;
  const canManageTeam = canSeeTeamTimesheet;

  const tab: Tab = search.tab ?? "my";
  const setTab = (t: Tab) => navigate({ search: { tab: t }, replace: true });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Clock className="h-7 w-7 text-primary" /> Attendance</h1>
        <p className="text-sm text-muted-foreground mt-1">Punch in/out, your timesheet, and (for managers) the team view.</p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="my"><Clock className="h-4 w-4 mr-1" /> Punch in/out</TabsTrigger>
          <TabsTrigger value="timesheet"><TableProperties className="h-4 w-4 mr-1" /> My timesheet</TabsTrigger>
          {canSeeTeamTimesheet && <TabsTrigger value="team-timesheet"><TableProperties className="h-4 w-4 mr-1" /> Team timesheet</TabsTrigger>}
          {canManageTeam && <TabsTrigger value="team"><Users className="h-4 w-4 mr-1" /> Team view</TabsTrigger>}
        </TabsList>

        <TabsContent value="my" className="mt-4"><PunchPage /></TabsContent>
        <TabsContent value="timesheet" className="mt-4"><MyTimesheetPage /></TabsContent>
        {canSeeTeamTimesheet && <TabsContent value="team-timesheet" className="mt-4"><TimesheetPage /></TabsContent>}
        {canManageTeam && <TabsContent value="team" className="mt-4"><AttendanceTeamPanel /></TabsContent>}
      </Tabs>
    </div>
  );
}
