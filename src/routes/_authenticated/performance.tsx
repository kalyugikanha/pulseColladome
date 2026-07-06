import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { currentWeekStart, upsertWeeklyScore, listMyScores, listTeamScores } from "@/lib/performance.functions";

export const Route = createFileRoute("/_authenticated/performance")({ component: PerformancePage });

function PerformancePage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const wkFn = useServerFn(currentWeekStart);
  const upsertFn = useServerFn(upsertWeeklyScore);
  const myFn = useServerFn(listMyScores);
  const teamFn = useServerFn(listTeamScores);

  const { data: wk } = useQuery({ queryKey: ["current-week"], queryFn: () => wkFn() });
  const weekStart = wk?.weekStart ?? "";

  const canScoreOthers = !!me && (me.isAdmin || me.isSuperAdmin || me.isHrAdmin || me.isReportingManager);

  const { data: reports } = useQuery({
    queryKey: ["scorable-people", me?.id],
    enabled: !!me && canScoreOthers,
    queryFn: async () => {
      if (me!.isAdmin || me!.isSuperAdmin || me!.isHrAdmin) {
        return (await supabase.from("profiles").select("id, full_name, email, department").order("full_name")).data ?? [];
      }
      const ids = me!.directReportIds ?? [];
      if (!ids.length) return [];
      return (await supabase.from("profiles").select("id, full_name, email, department").in("id", ids)).data ?? [];
    },
  });

  const { data: teamScores } = useQuery({
    queryKey: ["team-scores", (reports ?? []).map((r) => r.id).join(",")],
    enabled: !!me && canScoreOthers,
    queryFn: () => teamFn({ data: { employeeIds: (reports ?? []).map((r) => r.id), weeks: 12 } }),
  });

  const { data: mineScores } = useQuery({
    queryKey: ["my-scores", me?.id], enabled: !!me, queryFn: () => myFn(),
  });

  const scoreByEmp = useMemo(() => {
    const m = new Map<string, { current: number | null; feedback: string | null; history: { week_start: string; score: number }[] }>();
    for (const r of teamScores ?? []) {
      const rr = r as { employee_id: string; week_start: string; score: number; feedback: string | null };
      const rec = m.get(rr.employee_id) ?? { current: null, feedback: null, history: [] };
      rec.history.push({ week_start: rr.week_start, score: rr.score });
      if (rr.week_start === weekStart) { rec.current = rr.score; rec.feedback = rr.feedback; }
      m.set(rr.employee_id, rec);
    }
    return m;
  }, [teamScores, weekStart]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Weekly Performance</h1>
        <p className="text-muted-foreground text-sm mt-1">Score each teammate 0–10 for the week. Combines productivity, quality, and satisfaction.</p>
      </header>

      <Card>
        <CardHeader><CardTitle className="font-display text-base">My score history</CardTitle></CardHeader>
        <CardContent>
          {(mineScores?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No scores yet.</p>
          ) : (
            <div className="space-y-2">
              {mineScores!.map((s) => {
                const ss = s as { id: string; week_start: string; score: number; feedback: string | null; manager: { full_name?: string } | null };
                return (
                  <div key={ss.id} className="rounded-md border border-border/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Week of {format(new Date(ss.week_start), "MMM d, yyyy")}</span>
                      <Badge>{ss.score}/10</Badge>
                    </div>
                    {ss.feedback && <p className="text-xs text-muted-foreground mt-1">{ss.feedback}</p>}
                    {ss.manager?.full_name && <p className="text-[10px] text-muted-foreground mt-1">by {ss.manager.full_name}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {canScoreOthers && (
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Score my team — week of {weekStart && format(new Date(weekStart), "MMM d, yyyy")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(reports ?? []).map((r) => {
              const existing = scoreByEmp.get(r.id);
              return <ScoreRow key={r.id} employeeId={r.id} name={r.full_name ?? r.email ?? "—"} department={r.department}
                initialScore={existing?.current ?? null} initialFeedback={existing?.feedback ?? ""}
                history={existing?.history ?? []}
                onSubmit={async (score, feedback) => {
                  try {
                    await upsertFn({ data: { employeeId: r.id, weekStart, score, feedback } });
                    toast.success("Score saved");
                    qc.invalidateQueries();
                  } catch (e) { toast.error((e as Error).message); }
                }} />;
            })}
            {(reports?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Nobody to score.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScoreRow({ employeeId: _e, name, department, initialScore, initialFeedback, history, onSubmit }: {
  employeeId: string; name: string; department: string | null;
  initialScore: number | null; initialFeedback: string;
  history: { week_start: string; score: number }[];
  onSubmit: (score: number, feedback: string) => Promise<void>;
}) {
  const [score, setScore] = useState<string>(initialScore == null ? "" : String(initialScore));
  const [feedback, setFeedback] = useState(initialFeedback);
  const [saving, setSaving] = useState(false);
  const trend = history.slice().sort((a, b) => a.week_start.localeCompare(b.week_start));

  return (
    <div className="rounded-md border border-border/60 p-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{department ?? "—"}</div>
        </div>
        <div className="flex items-center gap-2">
          {trend.slice(-8).map((h) => (
            <div key={h.week_start} className="w-1 h-6 bg-primary/30 relative" title={`${h.week_start}: ${h.score}`}>
              <div className="absolute bottom-0 w-full bg-primary" style={{ height: `${(h.score / 10) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[100px_1fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Score (0–10)</Label>
          <Input type="number" min={0} max={10} value={score} onChange={(e) => setScore(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Feedback (private)</Label>
          <Textarea rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Optional note visible only to this teammate." />
        </div>
        <Button disabled={saving} onClick={async () => {
          const n = parseInt(score, 10);
          if (isNaN(n) || n < 0 || n > 10) { toast.error("Enter 0–10"); return; }
          setSaving(true);
          await onSubmit(n, feedback);
          setSaving(false);
        }}>Save</Button>
      </div>
    </div>
  );
}
