import { createFileRoute, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Star, TrendingUp, CheckCircle2, Users, BarChart3 } from "lucide-react";

type Tab = "mine" | "team" | "analytics";
type Range = "this_month" | "last_30" | "last_90" | "all";

export const Route = createFileRoute("/_authenticated/performance")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => {
    const t = s.tab;
    return { tab: t === "mine" || t === "team" || t === "analytics" ? t : undefined };
  },
  component: PerformanceHub,
});

function rangeStart(range: Range): string | null {
  const now = new Date();
  if (range === "this_month") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  if (range === "last_30") return new Date(now.getTime() - 30 * 86400_000).toISOString();
  if (range === "last_90") return new Date(now.getTime() - 90 * 86400_000).toISOString();
  return null;
}

function RangePicker({ value, onChange }: { value: Range; onChange: (v: Range) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Range)}>
      <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="this_month">This month</SelectItem>
        <SelectItem value="last_30">Last 30 days</SelectItem>
        <SelectItem value="last_90">Last 90 days</SelectItem>
        <SelectItem value="all">All time</SelectItem>
      </SelectContent>
    </Select>
  );
}

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
  const [range, setRange] = useState<Range>("this_month");
  const since = rangeStart(range);

  const { data: stats } = useQuery({
    queryKey: ["my-performance", me?.id, range],
    enabled: !!me?.id,
    queryFn: async () => {
      // Tasks assigned to me, filtered by created_at when a range is set.
      let tasksQ = supabase.from("tasks").select("id, status, created_at, updated_at").eq("assignee_id", me!.id);
      if (since) tasksQ = tasksQ.gte("created_at", since);

      let actsQ = supabase.from("task_activity" as never)
        .select("hours, approved_hours, approval_status, created_at")
        .eq("actor_id", me!.id)
        .not("hours", "is", null);
      if (since) actsQ = actsQ.gte("created_at", since);

      let ratingsQ = supabase.from("task_ratings" as never).select("rating").eq("ratee_id", me!.id);
      if (since) ratingsQ = ratingsQ.gte("created_at", since);

      const [tasks, activity, ratings] = await Promise.all([tasksQ, actsQ, ratingsQ]);
      const rows = (tasks.data ?? []) as Array<{ id: string; status: string; created_at: string; updated_at: string }>;
      const acts = ((activity.data ?? []) as unknown as Array<{ hours: number | string; approved_hours: number | string | null; approval_status: string }>);
      const rateRows = ((ratings.data ?? []) as unknown as Array<{ rating: number }>);

      let approvedHours = 0;
      let pendingHours = 0;
      for (const a of acts) {
        const status = a.approval_status;
        if (status === "rejected") continue;
        if (status === "approved" || status === "auto") {
          approvedHours += Number(a.approved_hours ?? a.hours ?? 0);
        } else {
          pendingHours += Number(a.hours ?? 0);
        }
      }

      const buckets = {
        todo: rows.filter((r) => r.status === "todo").length,
        in_progress: rows.filter((r) => r.status === "in_progress").length,
        review: rows.filter((r) => r.status === "review").length,
        done: rows.filter((r) => r.status === "done").length,
        blocked: rows.filter((r) => r.status === "blocked" || r.status === "cancelled").length,
      };
      const totalTasks = buckets.todo + buckets.in_progress + buckets.review + buckets.done + buckets.blocked;

      const avgRating = rateRows.length > 0
        ? rateRows.reduce((s, r) => s + Number(r.rating ?? 0), 0) / rateRows.length
        : null;
      return { ...buckets, totalTasks, approvedHours, pendingHours, avgRating, ratingCount: rateRows.length };
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">Tasks assigned to you and hours you've logged.</div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <Stat label="Total tasks" value={stats?.totalTasks ?? 0} icon={<CheckCircle2 className="h-5 w-5 text-primary" />} />
        <Stat label="To do" value={stats?.todo ?? 0} />
        <Stat label="In progress" value={stats?.in_progress ?? 0} />
        <Stat label="In review" value={stats?.review ?? 0} />
        <Stat label="Done" value={stats?.done ?? 0} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Blocked / cancelled" value={stats?.blocked ?? 0} />
        <Stat
          label="Hours logged"
          value={((stats?.approvedHours ?? 0) + (stats?.pendingHours ?? 0)).toFixed(1)}
          sub={`Approved ${(stats?.approvedHours ?? 0).toFixed(1)}h · Pending ${(stats?.pendingHours ?? 0).toFixed(1)}h`}
          icon={<TrendingUp className="h-5 w-5 text-primary" />}
        />
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Star className="h-5 w-5 text-yellow-500" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Average rating</div>
              {stats?.avgRating != null ? (
                <div className="flex items-baseline gap-1">
                  <div className="text-2xl font-bold">{stats.avgRating.toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">/ 5 · {stats.ratingCount}</div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground mt-1">No ratings.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">About these numbers</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Task counts reflect status right now, filtered to tasks <em>created</em> in the selected range. Hours logged sum activity <em>created</em> in the range — approved hours use your reviewer's approved value, pending hours are what you logged awaiting approval.</p>
          <Badge variant="outline" className="mt-2">Beta</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

type TeamScope = "reports" | "department";

function TeamPerformance() {
  const { data: me } = useCurrentUser();
  const [range, setRange] = useState<Range>("this_month");
  const [scope, setScope] = useState<TeamScope>("reports");
  const [dept, setDept] = useState<string | null>(null);
  const since = rangeStart(range);

  const headDepts = useMemo(() => me?.headOfDepartments ?? [], [me?.headOfDepartments]);
  const activeDept = dept ?? headDepts[0] ?? null;

  const { data: rows } = useQuery({
    queryKey: ["team-performance", me?.id, range, scope, activeDept],
    enabled: !!me?.id,
    queryFn: async () => {
      let people: Array<{ id: string; full_name: string | null; email: string | null; department: string | null }> = [];
      if (scope === "reports") {
        const { data } = await supabase.from("profiles")
          .select("id, full_name, email, department")
          .eq("reporting_manager_id", me!.id);
        people = (data ?? []) as typeof people;
      } else if (scope === "department" && activeDept) {
        const { data } = await supabase.from("profiles")
          .select("id, full_name, email, department")
          .eq("department", activeDept);
        people = ((data ?? []) as typeof people).filter((p) => p.id !== me!.id);
      }
      const ids = people.map((p) => p.id);
      if (ids.length === 0) return [];

      let tasksQ = supabase.from("tasks").select("assignee_id, status, created_at").in("assignee_id", ids);
      if (since) tasksQ = tasksQ.gte("created_at", since);
      let ratingsQ = supabase.from("task_ratings" as never).select("ratee_id, rating").in("ratee_id", ids);
      if (since) ratingsQ = ratingsQ.gte("created_at", since);

      const [tasksRes, ratingsRes] = await Promise.all([tasksQ, ratingsQ]);
      const tasks = (tasksRes.data ?? []) as Array<{ assignee_id: string; status: string }>;
      const ratings = ((ratingsRes.data ?? []) as unknown as Array<{ ratee_id: string; rating: number }>);

      return people.map((p) => {
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

  const showDeptToggle = headDepts.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {showDeptToggle ? (
            <ToggleGroup type="single" value={scope} onValueChange={(v) => v && setScope(v as TeamScope)} size="sm">
              <ToggleGroupItem value="reports">Direct reports</ToggleGroupItem>
              <ToggleGroupItem value="department">Department</ToggleGroupItem>
            </ToggleGroup>
          ) : (
            <Badge variant="outline">Direct reports</Badge>
          )}
          {scope === "department" && headDepts.length > 1 && (
            <Select value={activeDept ?? ""} onValueChange={(v) => setDept(v)}>
              <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {headDepts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {scope === "department" && activeDept && headDepts.length === 1 && (
            <Badge variant="secondary">{activeDept}</Badge>
          )}
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      {!rows ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {scope === "reports"
            ? "You don't have any direct reports yet."
            : `No people found in ${activeDept ?? "this department"}.`}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{r.full_name ?? r.email}</CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {scope === "reports" ? "Reports to you" : "In your department"}
                  </Badge>
                </div>
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
      )}
    </div>
  );
}

type AnalyticsScope = "company" | "department" | "me";

function OutputAnalytics() {
  const { data: me } = useCurrentUser();
  const [range, setRange] = useState<Range>("this_month");
  const canCompany = !!(me?.isAdmin || me?.isSuperAdmin);
  const headDepts = useMemo(() => me?.headOfDepartments ?? [], [me?.headOfDepartments]);
  const canDept = headDepts.length > 0;
  const [scope, setScope] = useState<AnalyticsScope>(canCompany ? "company" : canDept ? "department" : "me");
  const [dept, setDept] = useState<string | null>(null);
  const activeDept = dept ?? headDepts[0] ?? null;
  const since = rangeStart(range);

  const { data: rows } = useQuery({
    queryKey: ["output-analytics", me?.id, range, scope, activeDept],
    enabled: !!me?.id,
    queryFn: async () => {
      let deptUserIds: string[] | null = null;
      if (scope === "department" && activeDept) {
        const { data } = await supabase.from("profiles").select("id").eq("department", activeDept);
        deptUserIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
        if (deptUserIds.length === 0) deptUserIds = ["__none__"];
      }

      // Tasks created in range
      let createdQ = supabase.from("tasks").select("id, assignee_id, status, updated_at, created_at");
      if (since) createdQ = createdQ.gte("created_at", since);
      if (scope === "me") createdQ = createdQ.eq("assignee_id", me!.id);
      if (scope === "department" && deptUserIds) createdQ = createdQ.in("assignee_id", deptUserIds);

      // Tasks completed in range (proxy: status=done and updated_at in range)
      let completedQ = supabase.from("tasks").select("id, assignee_id, status, updated_at").eq("status", "done");
      if (since) completedQ = completedQ.gte("updated_at", since);
      if (scope === "me") completedQ = completedQ.eq("assignee_id", me!.id);
      if (scope === "department" && deptUserIds) completedQ = completedQ.in("assignee_id", deptUserIds);

      let actsQ = supabase.from("task_activity" as never).select("actor_id, hours, approved_hours, approval_status, created_at");
      if (since) actsQ = actsQ.gte("created_at", since);
      if (scope === "me") actsQ = actsQ.eq("actor_id", me!.id);
      if (scope === "department" && deptUserIds) actsQ = actsQ.in("actor_id", deptUserIds);

      const [createdRes, completedRes, actsRes] = await Promise.all([createdQ, completedQ, actsQ]);
      const created = (createdRes.data ?? []) as Array<{ id: string; status: string }>;
      const completed = (completedRes.data ?? []) as Array<{ id: string }>;
      const acts = ((actsRes.data ?? []) as unknown as Array<{ hours: number | string; approved_hours: number | string | null; approval_status: string }>);

      let approvedHours = 0;
      let pendingHours = 0;
      for (const a of acts) {
        if (a.approval_status === "rejected") continue;
        if (a.approval_status === "approved" || a.approval_status === "auto") {
          approvedHours += Number(a.approved_hours ?? a.hours ?? 0);
        } else {
          pendingHours += Number(a.hours ?? 0);
        }
      }
      const stillOpen = created.filter((t) => t.status !== "done").length;
      return {
        tasksCreated: created.length,
        completed: completed.length,
        stillOpen,
        approvedHours,
        pendingHours,
      };
    },
  });

  const scopeOptions: Array<{ v: AnalyticsScope; label: string }> = [
    ...(canCompany ? [{ v: "company" as const, label: "Company" }] : []),
    ...(canDept ? [{ v: "department" as const, label: "Department" }] : []),
    { v: "me" as const, label: "Just me" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <ToggleGroup type="single" value={scope} onValueChange={(v) => v && setScope(v as AnalyticsScope)} size="sm">
            {scopeOptions.map((o) => <ToggleGroupItem key={o.v} value={o.v}>{o.label}</ToggleGroupItem>)}
          </ToggleGroup>
          {scope === "department" && headDepts.length > 1 && (
            <Select value={activeDept ?? ""} onValueChange={(v) => setDept(v)}>
              <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {headDepts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {scope === "department" && activeDept && headDepts.length === 1 && (
            <Badge variant="secondary">{activeDept}</Badge>
          )}
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      {!rows ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="Tasks created" value={rows.tasksCreated} icon={<BarChart3 className="h-5 w-5 text-primary" />} />
            <Stat label="Completed" value={rows.completed} sub="Status → done in range" />
            <Stat label="Still open (created in range)" value={rows.stillOpen} />
            <Stat
              label="Hours logged"
              value={(rows.approvedHours + rows.pendingHours).toFixed(1)}
              sub={`Approved ${rows.approvedHours.toFixed(1)}h · Pending ${rows.pendingHours.toFixed(1)}h`}
              icon={<TrendingUp className="h-5 w-5 text-primary" />}
            />
          </div>
          <Card>
            <CardContent className="text-sm text-muted-foreground pt-6 space-y-1">
              <p><strong>Scope:</strong> {scope === "company" ? "Everyone" : scope === "department" ? `Department: ${activeDept ?? "—"}` : "Only your own tasks"}.</p>
              <p><strong>Completed</strong> counts tasks currently in status "done" whose record was last updated within the selected range (proxy for completion time — a schema field for exact done timestamp is on the roadmap).</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, icon, sub }: { label: string; value: number | string; icon?: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
          {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
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
