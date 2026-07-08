import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { punchIn as punchInServerFn, punchOut as punchOutServerFn, clearUnloggedHours as clearUnloggedHoursServerFn, type PunchInResult, type PunchOutResult } from "@/lib/punch.functions";
import { requestTaskFromManager } from "@/lib/tasks-plus.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, Plus, Trash2, Check, ChevronsUpDown, Send, AlertTriangle, X } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/punch")({
  component: PunchPage,
});

type Allocation = {
  project_id: string;
  project_code: string | null;
  project_name: string | null;
  task_id?: string | null;
  task_title?: string | null;
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

type Row = { projectId: string; taskId: string; hours: string; comments: string; atRisk: boolean };

export function PunchPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const punchInServer = useServerFn(punchInServerFn);
  const punchOutServer = useServerFn(punchOutServerFn);
  const clearUnloggedServer = useServerFn(clearUnloggedHoursServerFn);
  const requestTaskServer = useServerFn(requestTaskFromManager);
  const today = format(new Date(), "yyyy-MM-dd");
  const punchUserId = me?.realId ?? me?.id;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ projectId: "", taskId: "", hours: "", comments: "", atRisk: false }]);
  const [submitting, setSubmitting] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [reqTitle, setReqTitle] = useState("");
  const [reqProjectId, setReqProjectId] = useState<string>("");
  const [reqNote, setReqNote] = useState("");
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [punchingIn, setPunchingIn] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [punchOutAt, setPunchOutAt] = useState<string>("");
  const [unlogged, setUnlogged] = useState<{ balance: number; since: string | null }>({ balance: 0, since: null });
  const [unloggedDismissed, setUnloggedDismissed] = useState(false);

  const { data: sessions, refetch: refetchSessions } = useQuery({
    queryKey: ["punch-sessions-today", punchUserId],
    enabled: !!punchUserId,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("punch_sessions")
        .select("*")
        .eq("user_id", punchUserId!)
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

  const { data: myDept } = useQuery({
    queryKey: ["my-dept-for-punch", punchUserId],
    enabled: !!punchUserId,
    queryFn: async () => (await supabase.from("profiles").select("department").eq("id", punchUserId!).maybeSingle()).data?.department ?? null,
    staleTime: 5 * 60_000,
  });
  const requireTask = ((myDept ?? "").toLowerCase() === "marketing" || (myDept ?? "").toLowerCase() === "business development" || (myDept ?? "").toLowerCase() === "bd");

  const { data: myTasks } = useQuery({
    queryKey: ["my-punch-tasks", punchUserId],
    enabled: !!punchUserId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, status, project_id, updated_at, project:projects(id, code, name)")
        .eq("assignee_id", punchUserId!)
        .in("status", ["todo", "in_progress", "review", "done"])
        .not("project_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(200);
      const rows = (data ?? []) as Array<{ id: string; title: string; status: string; project_id: string | null; updated_at: string | null; project: { id: string; code: string; name: string } | null }>;
      // Active tasks first, then Done — each group ordered by most recent update.
      return [...rows.filter((t) => t.status !== "done"), ...rows.filter((t) => t.status === "done")];
    },
    staleTime: 60_000,
  });

  const { data: history } = useQuery({
    queryKey: ["punch-history", punchUserId],
    enabled: !!punchUserId,
    queryFn: async () => (await supabase.from("attendance_logs").select("date,total_hours,punch_in_time,punch_out_time").eq("user_id", punchUserId!).order("date", { ascending: false }).limit(14)).data ?? [],
  });

  const openSession = sessions?.find((s) => !s.punch_out_time) ?? null;
  const closedSessions = (sessions ?? []).filter((s) => s.punch_out_time);
  const totalToday = closedSessions.reduce((s, r) => s + Number(r.hours ?? 0), 0);

  useEffect(() => {
    if (!openSession) return;
    setNowTick(Date.now());
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [openSession?.id]);

  const sessionDurationHours = useMemo(() => {
    if (!openSession) return 0;
    return Number((differenceInMinutes(new Date(nowTick), new Date(openSession.punch_in_time)) / 60).toFixed(2));
  }, [openSession, nowTick]);

  const allocatedTotal = rows.reduce((s, r) => s + (Number(r.hours) || 0), 0);

  async function punchIn() {
    if (!me || punchingIn) return;
    if (openSession) { toast.error("You already have an open session. Punch out first."); return; }
    setPunchingIn(true);
    try {
      const result = await punchInServer({ data: { sessionDate: today } }) as PunchInResult;
      setUnlogged({ balance: Number(result.unloggedBalance ?? 0), since: result.unloggedSince ?? null });
      setUnloggedDismissed(false);
      if (result.session.session_date === today) {
        qc.setQueryData<Session[]>(["punch-sessions-today", punchUserId], (old = []) => {
          const next = old.some((row) => row.id === result.session.id)
            ? old.map((row) => row.id === result.session.id ? result.session as Session : row)
            : [...old, result.session as Session];
          return next.sort((a, b) => a.punch_in_time.localeCompare(b.punch_in_time));
        });
      }
      toast.success(result.status === "already_open" ? "You are already punched in — refreshed." : "Punched in");
      await refetchSessions();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["punch-sessions-today"] }),
        qc.invalidateQueries({ queryKey: ["punch-history"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["attendance"] }),
        qc.invalidateQueries({ queryKey: ["attendance-overview"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not punch in.");
    } finally {
      setPunchingIn(false);
    }
  }

  function toLocalDatetimeInput(d: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openPunchOut() {
    if (!openSession) return;
    const now = new Date();
    const suggested = Number((differenceInMinutes(now, new Date(openSession.punch_in_time)) / 60).toFixed(2));
    setRows([{ projectId: "", taskId: "", hours: suggested > 0 ? String(suggested) : "", comments: "", atRisk: false }]);
    setPunchOutAt(toLocalDatetimeInput(now));
    setDialogOpen(true);
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { projectId: "", taskId: "", hours: "", comments: "", atRisk: false }]);
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));
  }

  async function performPunchOut(opts: { skip: boolean }) {
    if (!openSession) return;

    let punchOutIso: string | null = null;
    if (punchOutAt) {
      const d = new Date(punchOutAt);
      if (Number.isNaN(d.getTime())) { toast.error("Invalid punch-out time."); return; }
      if (d.getTime() <= new Date(openSession.punch_in_time).getTime()) { toast.error("Punch-out must be after punch-in."); return; }
      if (d.getTime() > Date.now() + 60_000) { toast.error("Punch-out can't be in the future."); return; }
      punchOutIso = d.toISOString();
    }

    // Skip → send zero allocations. Otherwise, only include rows the user filled in.
    const usableRows = opts.skip
      ? []
      : rows.filter((r) => (r.taskId || r.projectId) && Number(r.hours) > 0);

    if (!opts.skip) {
      for (const [i, r] of usableRows.entries()) {
        if (requireTask && !r.taskId) { toast.error(`Row ${i + 1}: pick a task (required for your team).`); return; }
        if (!r.taskId && !r.projectId) { toast.error(`Row ${i + 1}: pick a task or project.`); return; }
      }
    }

    const allocations = usableRows.map((r) => ({
      projectId: r.projectId,
      taskId: r.taskId || null,
      hours: Number(Number(r.hours).toFixed(2)),
      comments: r.comments.trim(),
      atRisk: !!r.atRisk,
    }));
    const totalLogged = Number(allocations.reduce((s, a) => s + a.hours, 0).toFixed(2));

    setSubmitting(true);
    try {
      const result = await punchOutServer({ data: { sessionId: openSession.id, allocations, punchOutTime: punchOutIso, skip: opts.skip } }) as PunchOutResult;
      qc.setQueryData<Session[]>(["punch-sessions-today", punchUserId], (old = []) => old.map((row) => row.id === result.session.id ? result.session as Session : row));
      setUnlogged({ balance: Number(result.unloggedBalance ?? 0), since: result.unloggedSince ?? null });
      setUnloggedDismissed(false);
      await refetchSessions();
      if (opts.skip) {
        toast.success("Punched out — you can log hours later.");
      } else {
        toast.success(`Punched out — ${totalLogged.toFixed(2)}h logged across ${allocations.length} entr${allocations.length === 1 ? "y" : "ies"}.`);
      }
      setDialogOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["punch-sessions-today"] }),
        qc.invalidateQueries({ queryKey: ["punch-history"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["attendance"] }),
        qc.invalidateQueries({ queryKey: ["attendance-overview"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not punch out.");
    } finally {
      setSubmitting(false);
    }
  }

  const submitPunchOut = () => performPunchOut({ skip: false });
  const skipPunchOut = () => performPunchOut({ skip: true });

  async function dismissUnlogged() {
    setUnloggedDismissed(true);
    try { await clearUnloggedServer({}); setUnlogged({ balance: 0, since: null }); }
    catch { /* non-fatal */ }
  }

  async function submitTaskRequest() {
    if (!reqTitle.trim()) { toast.error("Task title is required."); return; }
    setReqSubmitting(true);
    try {
      await requestTaskServer({ data: { title: reqTitle.trim(), projectId: reqProjectId || null, note: reqNote.trim() || null } });
      toast.success("Request sent — your manager has been notified.");
      setRequestOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send request.");
    } finally {
      setReqSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Attendance</h1>
        <p className="text-muted-foreground text-sm mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")} — you can punch in and out as many times as you like.</p>
      </header>

      {unlogged.balance > 0 && !unloggedDismissed && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-medium text-foreground">You have {unlogged.balance.toFixed(1)}h unlogged{unlogged.since ? ` from ${format(new Date(unlogged.since), "MMM d")}` : ""}.</div>
            <div className="text-muted-foreground text-xs mt-0.5">Add them at your next punch-out — this reminder is only visible to you.</div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={dismissUnlogged} className="h-7 px-2 text-xs">
            <X className="h-3.5 w-3.5 mr-1" /> Dismiss
          </Button>
        </div>
      )}

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
              <Button size="lg" onClick={punchIn} disabled={!me || punchingIn} className="gradient-primary shadow-glow text-base h-12 px-8">
                {punchingIn ? "Punching in…" : "Punch in"}
              </Button>
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

          {openSession && (
            <div className="rounded-lg border border-border/60 p-3 bg-muted/20 space-y-1.5">
              <Label className="text-xs">Punch-out date & time</Label>
              <Input
                type="datetime-local"
                value={punchOutAt}
                min={toLocalDatetimeInput(new Date(openSession.punch_in_time))}
                max={toLocalDatetimeInput(new Date())}
                onChange={(e) => setPunchOutAt(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Default is now. Change it if you're logging a session from a previous day or an earlier time.</p>
            </div>
          )}

          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">

            {rows.map((r, idx) => {
              const pickedTask = r.taskId ? (myTasks ?? []).find((t) => t.id === r.taskId) : null;
              return (
                <div key={idx} className="rounded-lg border border-border/60 p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Entry {idx + 1}</span>
                    {rows.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(idx)} className="text-destructive h-7 px-2">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Task {requireTask && <span className="text-destructive">*</span>}</Label>
                    <TaskCombobox
                      tasks={myTasks ?? []}
                      value={r.taskId}
                      onChange={(taskId, projectId) => updateRow(idx, { taskId, projectId: projectId ?? "" })}
                      allowNone={!requireTask}
                    />
                    <button
                      type="button"
                      onClick={() => { setReqTitle(""); setReqProjectId(""); setReqNote(""); setRequestOpen(true); }}
                      className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Send className="h-3 w-3" /> Can't find your task? Request one from your manager
                    </button>
                    {requireTask && !myTasks?.length && (
                      <p className="text-[11px] text-warning">No active or recently completed tasks — request one above or pick a project below.</p>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Project {requireTask && <span className="text-muted-foreground text-[11px]">(auto from task)</span>}</Label>
                      <Select
                        value={r.projectId}
                        onValueChange={(v) => updateRow(idx, { projectId: v })}
                        disabled={requireTask && !!pickedTask}
                      >
                        <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                        <SelectContent>
                          {projects?.map((p) => (
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
                    <Label className="text-xs">What did you work on? <span className="text-muted-foreground">(optional)</span></Label>
                    <Textarea rows={2} placeholder="Short comment on this entry" value={r.comments} onChange={(e) => updateRow(idx, { comments: e.target.value })} />
                  </div>
                  {r.taskId && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={r.atRisk}
                        onCheckedChange={(v) => updateRow(idx, { atRisk: v === true })}
                      />
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        Flag this task as <span className="font-medium text-foreground">at risk</span> — visible to your reporting manager.
                      </span>
                    </label>
                  )}
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Add another project
            </Button>
          </div>

          <div className="flex items-center justify-between text-sm px-1">
            <span className="text-muted-foreground">Session length: <span className="font-semibold text-foreground">{(() => {
              if (!openSession) return sessionDurationHours.toFixed(2);
              const end = punchOutAt ? new Date(punchOutAt) : new Date(nowTick);
              if (Number.isNaN(end.getTime())) return sessionDurationHours.toFixed(2);
              return Math.max(0, Number((differenceInMinutes(end, new Date(openSession.punch_in_time)) / 60).toFixed(2))).toFixed(2);
            })()}h</span></span>
            <span className="font-semibold text-foreground">
              Logging: {allocatedTotal.toFixed(2)}h <span className="text-muted-foreground font-normal">(doesn't have to match)</span>
            </span>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={skipPunchOut} disabled={submitting} className="text-muted-foreground">
              Skip for now
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={submitPunchOut} disabled={submitting} className="gradient-primary">
                {submitting ? "Saving…" : "Punch out & log hours"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Request a task</DialogTitle>
            <DialogDescription>
              Your reporting manager will get this in their notifications and can create the task for you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Task title <span className="text-destructive">*</span></Label>
              <Input value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} placeholder="What do you need a task for?" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Project (optional)</Label>
              <Select value={reqProjectId || "__none__"} onValueChange={(v) => setReqProjectId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No project —</SelectItem>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={p.id}><span className="font-mono text-xs mr-2">{p.code}</span>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Note (optional)</Label>
              <Textarea rows={3} value={reqNote} onChange={(e) => setReqNote(e.target.value)} placeholder="Context for your manager" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)} disabled={reqSubmitting}>Cancel</Button>
            <Button onClick={submitTaskRequest} disabled={reqSubmitting} className="gradient-primary">
              {reqSubmitting ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type TaskComboTask = { id: string; title: string; status?: string; project_id: string | null; project: { code: string; name: string } | null };

function TaskCombobox({ tasks, value, onChange, allowNone }: {
  tasks: TaskComboTask[];
  value: string;
  onChange: (taskId: string, projectId: string | null) => void;
  allowNone: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = tasks.find((t) => t.id === value) ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate text-left">
            {selected ? (
              <>
                {selected.project?.code && <span className="font-mono text-xs mr-2">{selected.project.code}</span>}
                {selected.title}
              </>
            ) : (
              <span className="text-muted-foreground">Pick one of your open tasks</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by task or project code…" />
          <CommandList>
            <CommandEmpty>No tasks found.</CommandEmpty>
            {allowNone && (
              <CommandGroup>
                <CommandItem value="__none__" onSelect={() => { onChange("", null); setOpen(false); }}>
                  <Check className={`h-4 w-4 mr-2 ${!value ? "opacity-100" : "opacity-0"}`} />
                  — No task —
                </CommandItem>
              </CommandGroup>
            )}
            {(() => {
              const active = tasks.filter((t) => t.status !== "done");
              const done = tasks.filter((t) => t.status === "done");
              const renderItem = (t: TaskComboTask) => (
                <CommandItem
                  key={t.id}
                  value={`${t.project?.code ?? ""} ${t.title}`}
                  onSelect={() => { onChange(t.id, t.project_id); setOpen(false); }}
                >
                  <Check className={`h-4 w-4 mr-2 ${value === t.id ? "opacity-100" : "opacity-0"}`} />
                  {t.project?.code && <span className="font-mono text-xs mr-2">{t.project.code}</span>}
                  <span className="truncate">{t.title}</span>
                  {t.status === "done" && <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">Done</span>}
                </CommandItem>
              );
              return (
                <>
                  {active.length > 0 && (
                    <CommandGroup heading="Active">{active.map(renderItem)}</CommandGroup>
                  )}
                  {done.length > 0 && (
                    <CommandGroup heading="Recently completed">{done.map(renderItem)}</CommandGroup>
                  )}
                </>
              );
            })()}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
