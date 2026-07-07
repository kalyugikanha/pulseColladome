import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, TrendingUp, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/performance")({ component: MyPerformancePage });

function MyPerformancePage() {
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
          .select("hours, approval_status, completion_date")
          .eq("actor_id", me!.id)
          .not("hours", "is", null),
        supabase.from("task_ratings" as never)
          .select("rating")
          .eq("ratee_id", me!.id)
          .gte("created_at", monthStart),
      ]);
      const rows = (tasks.data ?? []) as Array<{ id: string; status: string; created_at: string }>;
      const acts = ((activity.data ?? []) as unknown as Array<{ hours: number | string; approval_status: string; completion_date: string | null }>);
      const rateRows = ((ratings.data ?? []) as unknown as Array<{ rating: number }>);
      const totalHours = acts.filter((a) => a.approval_status !== "rejected").reduce((s, a) => s + Number(a.hours ?? 0), 0);
      const done = rows.filter((r) => r.status === "done").length;
      const inProgress = rows.filter((r) => r.status === "in_progress" || r.status === "review").length;
      const avgRating = rateRows.length > 0
        ? rateRows.reduce((s, r) => s + Number(r.rating ?? 0), 0) / rateRows.length
        : null;
      return { done, inProgress, totalHours, totalTasks: rows.length, avgRating, ratingCount: rateRows.length };
    },
  });

  if (!me) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Star className="h-7 w-7 text-primary" /> My Performance</h1>
        <p className="text-sm text-muted-foreground mt-1">Your tasks and hours at a glance.</p>
      </header>

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
        <CardHeader>
          <CardTitle className="text-base">About My Performance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>All numbers reflect tasks assigned to you and hours you've logged. Approved hours land on your timesheet — hours pending your reviewer's approval are counted in "Total hours logged" too but marked "Awaiting approval" on My Timesheet.</p>
          <Badge variant="outline" className="mt-2">Beta</Badge>
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
