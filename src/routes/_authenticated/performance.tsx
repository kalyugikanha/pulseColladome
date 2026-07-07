import { createFileRoute, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Star, TrendingUp, CheckCircle2, Users, BarChart3 } from "lucide-react";

type Tab = "mine" | "team" | "analytics";

export const Route = createFileRoute("/_authenticated/performance")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => {
    const t = s.tab;
    return { tab: t === "mine" || t === "team" || t === "analytics" ? t : undefined };
  },
  component: PerformanceHub,
});

function PerformanceHub() {
  const { data: me } = useCurrentUser();
  const search = useRouterState({ select: (s) => s.location.search }) as { tab?: Tab };
  const navigate = useNavigate({ from: "/performance" });

  if (!me) return <div className="text-muted-foreground">Loading…</div>;

  const canSeeTeam = me.isReportingManager || me.isDepartmentHead || me.isAdmin || me.isSuperAdmin;
  const canSeeAnalytics = me.isDepartmentHead || me.isAdmin || me.isSuperAdmin;
  const tab: Tab = search.tab ?? "mine";
  const setTab = (t: Tab) => navigate({ search: { tab: t }, replace: true });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Star className="h-7 w-7 text-primary" /> Performance</h1>
        <p className="text-sm text-muted-foreground mt-1">Your performance{canSeeTeam ? ", your team, and analytics." : "."}</p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="mine"><Star className="h-4 w-4 mr-1" /> My performance</TabsTrigger>
          {canSeeTeam && <TabsTrigger value="team"><Users className="h-4 w-4 mr-1" /> Team</TabsTrigger>}
          {canSeeAnalytics && <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1" /> Output analytics</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine" className="mt-4"><MyPerformance /></TabsContent>
        {canSeeTeam && <TabsContent value="team" className="mt-4"><TeamPerformance /></TabsContent>}
        {canSeeAnalytics && <TabsContent value="analytics" className="mt-4"><OutputAnalytics /></TabsContent>}
      </Tabs>
    </div>
  );
}

function MyPerformance() {
  const { data: me } = useCurrentUser();

  const { data: stats } = useQuery({
    queryKey: ["my-performance", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const [tasks, activity, ratings] = await Promise.all([
        supabase.from("tasks").select("id, status, created_at").eq("assignee_id", me!.id),
        supabase.from("task_activity" as never)
          .select("hours, approved_hours, approval_status, completion_date")
          .eq("actor_id", me!.id)
          .not("hours", "is", null),
        supabase.from("task_ratings" as never)
          .select("rating")
          .eq("ratee_id", me!.id)
          .gte("created_at", monthStart),
      ]);
      const rows = (tasks.data ?? []) as Array<{ id: string; status: string; created_at: string }>;
      const acts = ((activity.data ?? []) as unknown as Array<{ hours: number | string; approved_hours: number | string | null; approval_status: string; completion_date: string | null }>);
      const rateRows = ((ratings.data ?? []) as unknown as Array<{ rating: number }>);
      const totalHours = acts.filter((a) => a.approval_status !== "rejected").reduce((s, a) => {
        const approved = a.approval_status === "approved" || a.approval_status === "auto";
        const h = approved ? Number(a.approved_hours ?? a.hours ?? 0) : Number(a.hours ?? 0);
        return s + h;
      }, 0);

      const done = rows.filter((r) => r.status === "done").length;
      const inProgress = rows.filter((r) => r.status === "in_progress" || r.status === "review").length;
      const avgRating = rateRows.length > 0
        ? rateRows.reduce((s, r) => s + Number(r.rating ?? 0), 0) / rateRows.length
        : null;
      return { done, inProgress, totalHours, totalTasks: rows.length, avgRating, ratingCount: rateRows.length };
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Total tasks" value={stats?.totalTasks ?? 0} icon={<CheckCircle2 className="h-5 w-5 text-primary" />} />
        <Stat label="Done" value={stats?.done ?? 0} />
        <Stat label="In progress / review" value={stats?.inProgress ?? 0} />
        <Stat label="Total hours logged" value={(stats?.totalHours ?? 0).toFixed(1)} icon={<TrendingUp className="h-5 w-5 text-primary" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Star className="h-4 w-4 text-yellow-500" /> Average rating this month</CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.avgRating != null ? (
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold">{stats.avgRating.toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">/ 5 · from {stats.ratingCount} rating{stats.ratingCount === 1 ? "" : "s"}</div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No ratings yet this month.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">About my performance</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>All numbers reflect tasks assigned to you and hours you've logged. Approved hours land on your timesheet — hours pending your reviewer's approval are counted in "Total hours logged" too but marked "Awaiting approval" on My Timesheet.</p>
          <Badge variant="outline" className="mt-2">Beta</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

function TeamPerformance() {
  const { data: me } = useCurrentUser();
  const { data: rows } = useQuery({
    queryKey: ["team-performance", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Team = people who report to me OR people in departments I head
      const [reportRes, headRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, department").eq("reporting_manager_id", me!.id),
        supabase.from("department_heads" as never).select("department").eq("user_id", me!.id),
      ]);
      const reportPeople = (reportRes.data ?? []) as Array<{ id: string; full_name: string | null; email: string | null; department: string | null }>;
      const headDepts = ((headRes.data ?? []) as unknown as Array<{ department: string }>).map((h) => h.department);

      let deptPeople: typeof reportPeople = [];
      if (headDepts.length > 0) {
        const { data } = await supabase.from("profiles").select("id, full_name, email, department").in("department", headDepts);
        deptPeople = (data ?? []) as typeof reportPeople;
      }

      const map = new Map<string, typeof reportPeople[number]>();
      for (const p of [...reportPeople, ...deptPeople]) if (p.id !== me!.id) map.set(p.id, p);
      const ids = Array.from(map.keys());
      if (ids.length === 0) return [];

      const [tasksRes, ratingsRes] = await Promise.all([
        supabase.from("tasks").select("assignee_id, status").in("assignee_id", ids),
        supabase.from("task_ratings" as never).select("ratee_id, rating").in("ratee_id", ids).gte("created_at", monthStart),
      ]);
      const tasks = (tasksRes.data ?? []) as Array<{ assignee_id: string; status: string }>;
      const ratings = ((ratingsRes.data ?? []) as unknown as Array<{ ratee_id: string; rating: number }>);

      return Array.from(map.values()).map((p) => {
        const t = tasks.filter((x) => x.assignee_id === p.id);
        const rs = ratings.filter((r) => r.ratee_id === p.id);
        return {
          ...p,
          totalTasks: t.length,
          done: t.filter((x) => x.status === "done").length,
          inProgress: t.filter((x) => x.status === "in_progress" || x.status === "review").length,
          avgRating: rs.length > 0 ? rs.reduce((s, r) => s + Number(r.rating), 0) / rs.length : null,
          ratingCount: rs.length,
        };
      }).sort((a, b) => (b.avgRating ?? -1) - (a.avgRating ?? -1));
    },
  });

  if (!rows) return <div className="text-muted-foreground">Loading…</div>;
  if (rows.length === 0) return <div className="text-sm text-muted-foreground">You don't have any direct reports yet.</div>;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((r) => (
        <Card key={r.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{r.full_name ?? r.email}</CardTitle>
            {r.department && <div className="text-xs text-muted-foreground">{r.department}</div>}
          </CardHeader>
          <CardContent className="grid grid-cols-4 gap-2 text-center">
            <MiniStat label="Tasks" value={r.totalTasks} />
            <MiniStat label="Done" value={r.done} />
            <MiniStat label="Active" value={r.inProgress} />
            <MiniStat label="Rating" value={r.avgRating != null ? r.avgRating.toFixed(1) : "—"} sub={r.avgRating != null ? `${r.ratingCount}` : undefined} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OutputAnalytics() {
  const { data: rows } = useQuery({
    queryKey: ["output-analytics"],
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const [tasksRes, actsRes] = await Promise.all([
        supabase.from("tasks").select("assignee_id, status, created_at").gte("created_at", monthStart),
        supabase.from("task_activity" as never).select("actor_id, hours, approved_hours, approval_status").gte("created_at", monthStart),
      ]);
      const tasks = (tasksRes.data ?? []) as Array<{ assignee_id: string | null; status: string }>;
      const acts = ((actsRes.data ?? []) as unknown as Array<{ actor_id: string; hours: number | string; approved_hours: number | string | null; approval_status: string }>);
      const totalDone = tasks.filter((t) => t.status === "done").length;
      const totalOpen = tasks.filter((t) => t.status !== "done").length;
      const totalHours = acts.filter((a) => a.approval_status !== "rejected").reduce((s, a) => {
        const approved = a.approval_status === "approved" || a.approval_status === "auto";
        return s + Number(approved ? (a.approved_hours ?? a.hours ?? 0) : (a.hours ?? 0));
      }, 0);
      return { totalDone, totalOpen, totalHours, totalTasks: tasks.length };
    },
  });

  if (!rows) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Tasks created (this month)" value={rows.totalTasks} icon={<BarChart3 className="h-5 w-5 text-primary" />} />
        <Stat label="Completed" value={rows.totalDone} />
        <Stat label="Still open" value={rows.totalOpen} />
        <Stat label="Total hours logged" value={rows.totalHours.toFixed(1)} icon={<TrendingUp className="h-5 w-5 text-primary" />} />
      </div>
      <Card>
        <CardContent className="text-sm text-muted-foreground pt-6">
          Company-wide output roll-up for the current month. Deeper breakdowns per department coming next.
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number | string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
