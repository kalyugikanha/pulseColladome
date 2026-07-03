import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/punch")({
  component: PunchPage,
});

type Session = {
  id: string;
  user_id: string;
  session_date: string;
  punch_in_time: string;
  punch_out_time: string | null;
  hours: number | null;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  comments: string | null;
};

function PunchPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [comments, setComments] = useState("");

  const { data: sessions, refetch: refetchSessions } = useQuery({
    queryKey: ["punch-sessions-today", me?.id],
    enabled: !!me,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("punch_sessions")
        .select("*")
        .eq("user_id", me!.id)
        .eq("session_date", today)
        .order("punch_in_time", { ascending: true });
      return (data ?? []) as Session[];
    },
  });

  const { data: projects } = useQuery({
    queryKey: ["projects-for-log"],
    enabled: !!me,
    queryFn: async () => (await supabase.from("projects").select("id, code, name").order("code")).data ?? [],
  });

  const { data: history } = useQuery({
    queryKey: ["punch-history", me?.id],
    enabled: !!me,
    queryFn: async () => (await supabase.from("attendance_logs").select("date,total_hours,punch_in_time,punch_out_time").eq("user_id", me!.id).order("date", { ascending: false }).limit(14)).data ?? [],
  });

  const openSession = sessions?.find((s) => !s.punch_out_time) ?? null;
  const closedSessions = (sessions ?? []).filter((s) => s.punch_out_time);
  const totalToday = closedSessions.reduce((s, r) => s + Number(r.hours ?? 0), 0);

  async function refreshDailyRollup() {
    if (!sessions || !me) return;
    // recompute from live query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: fresh } = await (supabase as any)
      .from("punch_sessions")
      .select("punch_in_time, punch_out_time, hours, project_id, project_code, project_name, comments")
      .eq("user_id", me.id)
      .eq("session_date", today)
      .order("punch_in_time", { ascending: true });
    const rows = (fresh ?? []) as Session[];
    if (rows.length === 0) return;
    const ins = rows.map((r) => r.punch_in_time).filter(Boolean).sort();
    const outs = rows.map((r) => r.punch_out_time).filter(Boolean).sort();
    const total = rows.reduce((s, r) => s + Number(r.hours ?? 0), 0);
    const tasks = rows
      .filter((r) => r.project_code)
      .map((r) => ({ project_id: r.project_id, project_code: r.project_code, project_name: r.project_name, hours: Number(r.hours ?? 0), comments: r.comments ?? "" }));
    await supabase.from("attendance_logs").upsert({
      user_id: me.id,
      date: today,
      punch_in_time: ins[0] ?? null,
      punch_out_time: outs.length ? outs[outs.length - 1] : null,
      total_hours: Number(total.toFixed(2)),
      tasks,
    }, { onConflict: "user_id,date" });
  }

  async function punchIn() {
    if (openSession) { toast.error("You already have an open session. Punch out first."); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("punch_sessions").insert({
      user_id: me!.id,
      session_date: today,
      punch_in_time: new Date().toISOString(),
    });
    if (error) { toast.error(error.message); return; }
    // upsert attendance_logs punch_in_time if not set
    const existing = (await supabase.from("attendance_logs").select("punch_in_time").eq("user_id", me!.id).eq("date", today).maybeSingle()).data;
    if (!existing?.punch_in_time) {
      await supabase.from("attendance_logs").upsert({ user_id: me!.id, date: today, punch_in_time: new Date().toISOString() }, { onConflict: "user_id,date" });
    }
    toast.success("Punched in");
    await refetchSessions();
    qc.invalidateQueries();
  }

  function openPunchOut() {
    if (!openSession) return;
    setProjectId("");
    setComments("");
    setDialogOpen(true);
  }

  async function submitPunchOut() {
    if (!openSession) return;
    if (!projectId) { toast.error("Pick a project."); return; }
    if (!comments.trim()) { toast.error("Add a short comment on what you did."); return; }
    const p = projects?.find((pr) => pr.id === projectId);
    const now = new Date();
    const hours = Number((differenceInMinutes(now, new Date(openSession.punch_in_time)) / 60).toFixed(2));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("punch_sessions").update({
      punch_out_time: now.toISOString(),
      hours,
      project_id: projectId,
      project_code: p?.code ?? null,
      project_name: p?.name ?? null,
      comments: comments.trim(),
    }).eq("id", openSession.id);
    if (error) { toast.error(error.message); return; }
    await refetchSessions();
    await refreshDailyRollup();
    toast.success(`Session logged — ${hours.toFixed(2)}h on ${p?.code}`);
    setDialogOpen(false);
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Attendance</h1>
        <p className="text-muted-foreground text-sm mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")} — you can punch in and out as many times as you like.</p>
      </header>

      <Card className="shadow-elevated overflow-hidden">
        <div className="gradient-surface p-8 md:p-12 relative">
          <div aria-hidden className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Status</div>
              <div className="mt-2 flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${openSession ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                <span className="font-display text-2xl md:text-3xl font-bold">
                  {openSession ? `Punched in since ${format(new Date(openSession.punch_in_time), "HH:mm")}` : closedSessions.length ? `Last session ended at ${format(new Date(closedSessions[closedSessions.length - 1].punch_out_time!), "HH:mm")}` : "Not punched in"}
                </span>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">Today's total: <span className="font-semibold text-foreground">{totalToday.toFixed(2)}h</span> across {closedSessions.length} session{closedSessions.length === 1 ? "" : "s"}.</div>
            </div>
            {openSession ? (
              <Button size="lg" onClick={openPunchOut} className="gradient-primary shadow-glow text-base h-12 px-8">Punch out</Button>
            ) : (
              <Button size="lg" onClick={punchIn} className="gradient-primary shadow-glow text-base h-12 px-8">Punch in</Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Today's sessions</CardTitle>
          <CardDescription>Each punch-out is logged against a project.</CardDescription>
        </CardHeader>
        <CardContent>
          {(sessions?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions yet today.</p>
          ) : (
            <div className="grid gap-2">
              {sessions!.map((s) => (
                <div key={s.id} className="rounded-lg border border-border/60 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{format(new Date(s.punch_in_time), "HH:mm")} → {s.punch_out_time ? format(new Date(s.punch_out_time), "HH:mm") : "…"}</span>
                    {s.project_code && <Badge variant="secondary" className="font-mono text-xs">{s.project_code}</Badge>}
                    {s.project_name && <span className="font-medium">{s.project_name}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    {s.comments && <span className="text-muted-foreground truncate max-w-md">{s.comments}</span>}
                    <Badge variant="outline">{s.hours != null ? `${Number(s.hours).toFixed(2)}h` : "open"}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Last 14 days</CardTitle><CardDescription>Daily totals</CardDescription></CardHeader>
        <CardContent>
          {(history?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <div className="grid gap-2">
              {history!.map((h) => (
                <div key={h.date} className="flex items-center justify-between rounded-lg border border-border/60 p-3 text-sm">
                  <div className="font-medium">{format(new Date(h.date), "EEE, MMM d")}</div>
                  <div className="text-muted-foreground">{h.punch_in_time ? format(new Date(h.punch_in_time), "HH:mm") : "—"} → {h.punch_out_time ? format(new Date(h.punch_out_time), "HH:mm") : "—"}</div>
                  <Badge variant="outline">{h.total_hours ? `${Number(h.total_hours).toFixed(2)}h` : "open"}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Log this session</DialogTitle>
            <DialogDescription>
              {openSession && `Started at ${format(new Date(openSession.punch_in_time), "HH:mm")} — about ${(differenceInMinutes(new Date(), new Date(openSession.punch_in_time)) / 60).toFixed(2)}h so far.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Select project (name + ID)" /></SelectTrigger>
                <SelectContent>
                  {projects?.map((p) => <SelectItem key={p.id} value={p.id}><span className="font-mono text-xs mr-2">{p.code}</span>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Comments</Label>
              <Textarea rows={4} placeholder="What did you work on during this session?" value={comments} onChange={(e) => setComments(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitPunchOut} className="gradient-primary">Punch out</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
