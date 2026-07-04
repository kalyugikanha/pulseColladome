import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, ListChecks, CalendarRange, FolderKanban, Users, TrendingUp, CheckCircle2, AlertCircle } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { GoogleCalendarConnectCard } from "@/components/google-calendar-connect";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function StatCard({ icon: Icon, label, value, hint, tone = "default" }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; hint?: string; tone?: "default" | "primary" | "success" | "warning" }) {
  const ring = tone === "primary" ? "ring-primary/30 bg-primary/10 text-primary" : tone === "success" ? "ring-success/30 bg-success/10 text-success" : tone === "warning" ? "ring-warning/30 bg-warning/10 text-warning" : "ring-border bg-muted text-muted-foreground";
  return (
    <Card className="shadow-elevated border-border/60">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-2 font-display text-2xl font-bold">{value}</div>
            {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${ring}`}><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { data: me } = useCurrentUser();
  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  const { data } = useQuery({
    queryKey: ["dashboard", me?.id, me?.isAdmin],
    enabled: !!me,
    queryFn: async () => {
      const uid = me!.id;
      const [todayLog, weekLogs, myTasks, myLeave, balances] = await Promise.all([
        supabase.from("attendance_logs").select("*").eq("user_id", uid).eq("date", today).maybeSingle(),
        supabase.from("attendance_logs").select("total_hours,date").eq("user_id", uid).gte("date", weekStart).lte("date", weekEnd),
        supabase.from("tasks").select("id,title,status,priority,due_date,project:projects(name)").eq("assignee_id", uid).neq("status", "done").order("due_date", { ascending: true }).limit(5),
        supabase.from("leave_requests").select("id,leave_type,start_date,end_date,status").eq("user_id", uid).order("created_at", { ascending: false }).limit(3),
        supabase.from("leave_balances").select("leave_type,allocated,used").eq("user_id", uid),
      ]);

      let admin: any = null;
      if (me!.isAdmin) {
        const [punchedIn, pendingLeave, activeProjects, weekTeamHours] = await Promise.all([
          supabase.from("attendance_logs").select("user_id,punch_in_time,punch_out_time").eq("date", today),
          supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "active"),
          supabase.from("attendance_logs").select("total_hours").gte("date", weekStart).lte("date", weekEnd),
        ]);
        admin = {
          punchedInCount: punchedIn.data?.filter((l) => l.punch_in_time && !l.punch_out_time).length ?? 0,
          totalToday: punchedIn.data?.length ?? 0,
          pendingLeave: pendingLeave.count ?? 0,
          activeProjects: activeProjects.count ?? 0,
          teamHours: (weekTeamHours.data ?? []).reduce((s, r) => s + Number(r.total_hours ?? 0), 0),
        };
      }
      return { todayLog: todayLog.data, weekLogs: weekLogs.data ?? [], myTasks: myTasks.data ?? [], myLeave: myLeave.data ?? [], balances: balances.data ?? [], admin };
    },
  });

  const weekHours = (data?.weekLogs ?? []).reduce((s, r) => s + Number(r.total_hours ?? 0), 0);
  const punchedIn = !!data?.todayLog?.punch_in_time && !data?.todayLog?.punch_out_time;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Welcome back{me?.fullName ? `, ${me.fullName.split(" ")[0]}` : ""}.</h1>
          <p className="text-muted-foreground text-sm mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <Button asChild size="lg" className="gradient-primary shadow-glow">
          <Link to="/punch">{punchedIn ? "Punch out" : "Punch in"}</Link>
        </Button>
      </header>

      <GoogleCalendarConnectCard />


      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Clock} label="Status today" value={punchedIn ? "Punched in" : data?.todayLog?.punch_out_time ? "Signed off" : "Not started"} hint={data?.todayLog?.punch_in_time ? `Since ${format(new Date(data.todayLog.punch_in_time), "HH:mm")}` : "Tap punch in to begin"} tone={punchedIn ? "success" : "default"} />
        <StatCard icon={TrendingUp} label="Hours this week" value={weekHours.toFixed(1)} hint="Mon–Sun" tone="primary" />
        <StatCard icon={ListChecks} label="Open tasks" value={data?.myTasks.length ?? 0} hint="Assigned to you" />
        <StatCard icon={CalendarRange} label="Leave balance" value={`${(data?.balances ?? []).reduce((s, r) => s + (Number(r.allocated) - Number(r.used)), 0).toFixed(1)}d`} hint="Across all types" tone="warning" />
      </section>

      {me?.isAdmin && data?.admin && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Team snapshot</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Clock} label="Punched in now" value={data.admin.punchedInCount} hint={`${data.admin.totalToday} logged today`} tone="success" />
            <StatCard icon={AlertCircle} label="Pending leave" value={data.admin.pendingLeave} hint="Awaiting your review" tone="warning" />
            <StatCard icon={FolderKanban} label="Active projects" value={data.admin.activeProjects} />
            <StatCard icon={TrendingUp} label="Team hours (wk)" value={data.admin.teamHours.toFixed(1)} tone="primary" />
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle className="font-display">Upcoming tasks</CardTitle><CardDescription>Your next actions</CardDescription></div>
            <Button variant="ghost" size="sm" asChild><Link to="/tasks">View all</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.myTasks.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Nothing on your plate — enjoy the clear runway.</p>}
            {data?.myTasks.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3 hover:bg-accent/40 transition">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.project?.name}{t.due_date ? ` · Due ${format(new Date(t.due_date), "MMM d")}` : ""}</div>
                </div>
                <Badge variant="outline" className="capitalize">{t.priority}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle className="font-display">Leave activity</CardTitle><CardDescription>Recent requests</CardDescription></div>
            <Button variant="ghost" size="sm" asChild><Link to="/leave">Manage</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.myLeave.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No leave requests yet.</p>}
            {data?.myLeave.map((l: any) => (
              <div key={l.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div>
                  <div className="text-sm font-medium capitalize">{l.leave_type} leave</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(l.start_date), "MMM d")} – {format(new Date(l.end_date), "MMM d")}</div>
                </div>
                <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"} className="capitalize">
                  {l.status === "approved" && <CheckCircle2 className="h-3 w-3 mr-1" />}{l.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
