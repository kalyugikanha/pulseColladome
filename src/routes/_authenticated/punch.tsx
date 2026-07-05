import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Clock, Plus, Trash2 } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/punch")({
  component: PunchPage,
});

type Allocation = {
  project_id: string;
  project_code: string | null;
  project_name: string | null;
  hours: number;
  comments: string;
};

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
  allocations: Allocation[] | null;
};

type Row = { projectId: string; hours: string; comments: string };

function PunchPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ projectId: "", hours: "", comments: "" }]);
  const [submitting, setSubmitting] = useState(false);

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

  const sessionDurationHours = useMemo(() => {
    if (!openSession) return 0;
    return Number((differenceInMinutes(new Date(), new Date(openSession.punch_in_time)) / 60).toFixed(2));
  }, [openSession, dialogOpen]);

  const allocatedTotal = rows.reduce((s, r) => s + (Number(r.hours) || 0), 0);

  async function refreshDailyRollup() {
    if (!me) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: fresh } = await (supabase as any)
      .from("punch_sessions")
      .select("punch_in_time, punch_out_time, hours, allocations")
      .eq("user_id", me.id)
      .eq("session_date", today)
      .order("punch_in_time", { ascending: true });
    const rowsFresh = (fresh ?? []) as Session[];
    if (rowsFresh.length === 0) return;
    const ins = rowsFresh.map((r) => r.punch_in_time).filter(Boolean).sort();
    const outs = rowsFresh.map((r) => r.punch_out_time).filter(Boolean).sort();
    const total = rowsFresh.reduce((s, r) => s + Number(r.hours ?? 0), 0);
    const tasks = rowsFresh.flatMap((r) => (r.allocations ?? []).map((a) => ({
      project_id: a.project_id,
      project_code: a.project_code,
      project_name: a.project_name,
      hours: Number(a.hours ?? 0),
      comments: a.comments ?? "",
    })));
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
    const suggested = Number((differenceInMinutes(new Date(), new Date(openSession.punch_in_time)) / 60).toFixed(2));
    setRows([{ projectId: "", hours: suggested > 0 ? String(suggested) : "", comments: "" }]);
    setDialogOpen(true);
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { projectId: "", hours: "", comments: "" }]);
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));
  }

  async function submitPunchOut() {
    if (!openSession) return;
    if (rows.length === 0) { toast.error("Add at least one project."); return; }
    for (const [i, r] of rows.entries()) {
      if (!r.projectId) { toast.error(`Row ${i + 1}: pick a project.`); return; }
      const h = Number(r.hours);
      if (!Number.isFinite(h) || h <= 0) { toast.error(`Row ${i + 1}: enter hours (>0).`); return; }
      if (!r.comments.trim()) { toast.error(`Row ${i + 1}: add a comment.`); return; }
    }
    const ids = rows.map((r) => r.projectId);
    if (new Set(ids).size !== ids.length) { toast.error("Same project listed twice — merge them."); return; }

    const allocations: Allocation[] = rows.map((r) => {
      const p = projects?.find((pr) => pr.id === r.projectId);
      return {
        project_id: r.projectId,
        project_code: p?.code ?? null,
        project_name: p?.name ?? null,
        hours: Number(Number(r.hours).toFixed(2)),
        comments: r.comments.trim(),
      };
    });
    const totalHours = Number(allocations.reduce((s, a) => s + a.hours, 0).toFixed(2));
    const first = allocations[0];
    const now = new Date();

    setSubmitting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("punch_sessions").update({
      punch_out_time: now.toISOString(),
      hours: totalHours,
      project_id: first.project_id,
      project_code: first.project_code,
      project_name: first.project_name,
      comments: allocations.length === 1
        ? first.comments
        : allocations.map((a) => `[${a.project_code ?? ""}] ${a.hours}h — ${a.comments}`).join("\n"),
      allocations,
    }).eq("id", openSession.id);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    await refetchSessions();
    await refreshDailyRollup();
    toast.success(`Session logged — ${totalHours.toFixed(2)}h across ${allocations.length} project${allocations.length === 1 ? "" : "s"}`);
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
          <CardDescription>Each punch-out can log multiple projects with hours allocated to each.</CardDescription>
        </CardHeader>
        <CardContent>
          {(sessions?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions yet today.</p>
          ) : (
            <div className="grid gap-3">
              {sessions!.map((s) => {
                const allocs = (s.allocations ?? []) as Allocation[];
                return (
                  <div key={s.id} className="rounded-lg border border-border/60 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-muted-foreground">{format(new Date(s.punch_in_time), "HH:mm")} → {s.punch_out_time ? format(new Date(s.punch_out_time), "HH:mm") : "…"}</span>
                      <Badge variant="outline">{s.hours != null ? `${Number(s.hours).toFixed(2)}h` : "open"}</Badge>
                    </div>
                    {allocs.length > 0 ? (
                      <div className="mt-2 grid gap-1.5">
                        {allocs.map((a, i) => (
                          <div key={i} className="flex flex-wrap items-start gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                            {a.project_code && <Badge variant="secondary" className="font-mono text-xs">{a.project_code}</Badge>}
                            {a.project_name && <span className="font-medium">{a.project_name}</span>}
                            <Badge variant="outline">{Number(a.hours).toFixed(2)}h</Badge>
                            {a.comments && <span className="text-muted-foreground flex-1 min-w-0">{a.comments}</span>}
                          </div>
                        ))}
                      </div>
                    ) : (s.project_code || s.comments) ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
                        {s.project_code && <Badge variant="secondary" className="font-mono text-xs">{s.project_code}</Badge>}
                        {s.project_name && <span className="font-medium text-foreground">{s.project_name}</span>}
                        {s.comments && <span className="truncate">{s.comments}</span>}
                      </div>
                    ) : null}
                  </div>
                );
              })}
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Log this session</DialogTitle>
            <DialogDescription>
              {openSession && `Started at ${format(new Date(openSession.punch_in_time), "HH:mm")} — about ${sessionDurationHours.toFixed(2)}h so far. Split the time across the projects you worked on.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {rows.map((r, idx) => {
              const used = new Set(rows.filter((_, i) => i !== idx).map((rr) => rr.projectId).filter(Boolean));
              return (
                <div key={idx} className="rounded-lg border border-border/60 p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Project {idx + 1}</span>
                    {rows.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(idx)} className="text-destructive h-7 px-2">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Project</Label>
                      <Select value={r.projectId} onValueChange={(v) => updateRow(idx, { projectId: v })}>
                        <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                        <SelectContent>
                          {projects?.filter((p) => !used.has(p.id)).map((p) => (
                            <SelectItem key={p.id} value={p.id}><span className="font-mono text-xs mr-2">{p.code}</span>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Hours</Label>
                      <Input type="number" min="0" step="0.25" placeholder="e.g. 2.5" value={r.hours} onChange={(e) => updateRow(idx, { hours: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">What did you work on?</Label>
                    <Textarea rows={2} placeholder="Short comment on this project" value={r.comments} onChange={(e) => updateRow(idx, { comments: e.target.value })} />
                  </div>
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Add another project
            </Button>
          </div>

          <div className="flex items-center justify-between text-sm px-1">
            <span className="text-muted-foreground">Session length: <span className="font-semibold text-foreground">{sessionDurationHours.toFixed(2)}h</span></span>
            <span className={`font-semibold ${Math.abs(allocatedTotal - sessionDurationHours) > 0.25 ? "text-amber-600" : "text-foreground"}`}>
              Allocated: {allocatedTotal.toFixed(2)}h
            </span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submitPunchOut} disabled={submitting} className="gradient-primary">
              {submitting ? "Saving…" : "Punch out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
