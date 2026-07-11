import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, FolderKanban, Clock, Pencil, Wallet, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [openProject, setOpenProject] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [logFor, setLogFor] = useState<{ id: string; code: string; name: string } | null>(null);
  const [editProject, setEditProject] = useState<any | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [pName, setPName] = useState(""); const [pCode, setPCode] = useState(""); const [pClient, setPClient] = useState(""); const [pDesc, setPDesc] = useState(""); const [pStatus, setPStatus] = useState<"active"|"on_hold"|"completed">("active");
  const [tTitle, setTTitle] = useState(""); const [tDesc, setTDesc] = useState(""); const [tDue, setTDue] = useState(""); const [tPri, setTPri] = useState<"low"|"medium"|"high">("medium"); const [tAssign, setTAssign] = useState<string>("");


  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await supabase.from("projects").select("*, tasks(id,title,status,priority,due_date,assignee_id,assignee:profiles!tasks_assignee_profile_fkey(full_name))").order("created_at", { ascending: false })).data ?? [],
  });

  const { data: people } = useQuery({
    queryKey: ["profiles-all"],
    enabled: !!me?.canManageProjects,
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email")).data ?? [],
  });

  const { data: timeLog } = useQuery({
    queryKey: ["project-time-log", logFor?.code],
    enabled: !!logFor && !!me?.canManageProjects,
    queryFn: async () => {
      // Fetch all entries; approval is per-day. We surface both logged and
      // approved totals so nothing is hidden while still flagging the
      // approved subset (the only one that feeds burn/finances).
      const { data } = await supabase.from("attendance_logs").select("date, user_id, tasks, approved_at");
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email");
      const nameOf = (uid: string) => profs?.find((p) => p.id === uid)?.full_name ?? profs?.find((p) => p.id === uid)?.email ?? "Unknown";
      const rows: { date: string; userId: string; user: string; hours: number; approvedHours: number | null; comments: string; approved: boolean }[] = [];
      (data ?? []).forEach((log: any) => {
        (log.tasks ?? []).forEach((t: any) => {
          if (t.project_code === logFor!.code || t.project_id === logFor!.id) {
            const logged = Number(t.hours) || 0;
            const approvedRaw = t.approved_hours;
            const approvedH = approvedRaw != null && !Number.isNaN(Number(approvedRaw)) ? Number(approvedRaw) : null;
            rows.push({ date: log.date, userId: log.user_id, user: nameOf(log.user_id), hours: logged, approvedHours: approvedH, comments: t.comments ?? "", approved: !!log.approved_at });
          }
        });
      });
      return rows.sort((a, b) => b.date.localeCompare(a.date));
    },
  });
  const loggedTotal = (timeLog ?? []).reduce((s, r) => s + r.hours, 0);
  const approvedTotal = (timeLog ?? []).filter((r) => r.approved).reduce((s, r) => s + (r.approvedHours ?? r.hours), 0);

  // Approved-hours-based project burn — same salary-share math as
  // project-burn.tsx, scoped to just this project across every month it
  // touches. Admin-only: costs are visible only to finance admins.
  const approvedUserMonths = useMemo(() => {
    const s = new Set<string>();
    for (const r of timeLog ?? []) if (r.approved) s.add(`${r.userId}|${r.date.slice(0, 7)}`);
    return s;
  }, [timeLog]);
  const monthsInvolved = useMemo(() => Array.from(new Set(Array.from(approvedUserMonths).map((k) => k.split("|")[1]))).sort(), [approvedUserMonths]);
  const usersInvolved = useMemo(() => Array.from(new Set(Array.from(approvedUserMonths).map((k) => k.split("|")[0]))), [approvedUserMonths]);

  const { data: burnCtx } = useQuery({
    queryKey: ["project-burn-ctx", logFor?.code, monthsInvolved.join(","), usersInvolved.join(",")],
    enabled: !!logFor && !!me?.isFinanceAdmin && usersInvolved.length > 0 && monthsInvolved.length > 0,
    queryFn: async () => {
      // Range covering all months involved (inclusive).
      const [ys, ms] = monthsInvolved[0].split("-").map(Number);
      const last = monthsInvolved[monthsInvolved.length - 1];
      const [ye, me2] = last.split("-").map(Number);
      const start = new Date(Date.UTC(ys, ms - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(ye, me2, 1)).toISOString().slice(0, 10);
      const [{ data: approvedLogs }, { data: salariesRaw }, { data: unpaidRaw }] = await Promise.all([
        supabase.from("attendance_logs").select("user_id, date, tasks").not("approved_at", "is", null).in("user_id", usersInvolved).gte("date", start).lt("date", end),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("salaries").select("user_id, monthly_salary, effective_from").in("user_id", usersInvolved).order("effective_from", { ascending: false }),
        supabase.from("leave_requests").select("user_id, start_date, end_date").eq("leave_type", "unpaid").eq("status", "approved").in("user_id", usersInvolved),
      ]);
      return {
        approvedLogs: (approvedLogs ?? []) as Array<{ user_id: string; date: string; tasks: Array<{ project_code?: string; hours?: number }> | null }>,
        salaries: (salariesRaw ?? []) as Array<{ user_id: string; monthly_salary: number; effective_from: string }>,
        unpaid: (unpaidRaw ?? []) as Array<{ user_id: string; start_date: string; end_date: string }>,
      };
    },
  });

  const projectBurnTotal = useMemo(() => {
    if (!burnCtx || !logFor) return 0;
    // Effective raw monthly salary for (user, month) — latest row with effective_from <= end-of-month.
    const rawSalaryFor = (uid: string, month: string) => {
      const [y, m] = month.split("-").map(Number);
      const cutoff = new Date(Date.UTC(y, m, 0));
      for (const s of burnCtx.salaries) {
        if (s.user_id !== uid) continue;
        if (new Date(s.effective_from) > cutoff) continue;
        return { monthly_salary: Number(s.monthly_salary), effective_from: s.effective_from };
      }
      return null;
    };
    // Pro-rated monthly salary matching /finances + /project-burn.
    const proratedSalary = (uid: string, month: string) => {
      const raw = rawSalaryFor(uid, month);
      if (!raw) return 0;
      const [y, m] = month.split("-").map(Number);
      const daysInMo = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const monthStart = new Date(Date.UTC(y, m - 1, 1));
      const monthEnd = new Date(Date.UTC(y, m, 0));
      const eff = new Date(raw.effective_from);
      const startDay = eff > monthStart ? eff.getUTCDate() : 1;
      const effectiveDays = daysInMo - startDay + 1;
      // Unpaid leave days overlapping this month.
      const DAY = 86400000;
      let unpaidDays = 0;
      for (const lr of burnCtx.unpaid) {
        if (lr.user_id !== uid) continue;
        const s = Date.parse(lr.start_date);
        const e = Date.parse(lr.end_date);
        if (isNaN(s) || isNaN(e)) continue;
        const from = Math.max(s, monthStart.getTime());
        const to = Math.min(e, monthEnd.getTime());
        if (to < from) continue;
        unpaidDays += Math.round((to - from) / DAY) + 1;
      }
      const payableDays = Math.max(0, effectiveDays - unpaidDays);
      if (payableDays <= 0) return 0;
      return raw.monthly_salary * payableDays / daysInMo;
    };
    // Per-(user, month) total approved hours across every project.
    const monthlyTotals = new Map<string, number>(); // "uid|YYYY-MM" -> hours
    for (const row of burnCtx.approvedLogs) {
      const key = `${row.user_id}|${row.date.slice(0, 7)}`;
      let h = 0;
      for (const t of row.tasks ?? []) h += Number(t.hours) || 0;
      monthlyTotals.set(key, (monthlyTotals.get(key) ?? 0) + h);
    }
    // Sum burn for entries on THIS project only.
    let total = 0;
    for (const row of burnCtx.approvedLogs) {
      const month = row.date.slice(0, 7);
      const key = `${row.user_id}|${month}`;
      const monthlyHrs = monthlyTotals.get(key) ?? 0;
      if (monthlyHrs <= 0) continue;
      const salary = proratedSalary(row.user_id, month);
      if (salary <= 0) continue;
      for (const t of row.tasks ?? []) {
        if (t.project_code !== logFor.code) continue;
        const h = Number(t.hours) || 0;
        if (h <= 0) continue;
        total += (h / monthlyHrs) * salary;
      }
    }
    return total;
  }, [burnCtx, logFor]);

  const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  const { data: vendorPayments } = useQuery({
    queryKey: ["vendor-payments-by-project"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => (await supabase.from("vendor_payments").select("project_id, amount, status")).data ?? [],
  });
  const paySummary = (projectId: string) => {
    const rows = (vendorPayments ?? []).filter((r: any) => r.project_id === projectId);
    return rows.reduce(
      (acc: { pending: number; paid: number }, r: any) => {
        if (r.status === "paid") acc.paid += Number(r.amount);
        else acc.pending += Number(r.amount);
        return acc;
      },
      { pending: 0, paid: 0 },
    );
  };


  async function createProject() {
    if (!pName) return toast.error("Name required");
    if (!pCode.trim()) return toast.error("Project ID required (e.g. CLDM00XXX)");
    const { error } = await supabase.from("projects").insert({ code: pCode.trim().toUpperCase(), name: pName, client_name: pClient || null, description: pDesc || null, status: pStatus, start_date: format(new Date(), "yyyy-MM-dd"), created_by: me!.realId });
    if (error) return toast.error(error.message);
    toast.success("Project created");
    setPName(""); setPCode(""); setPClient(""); setPDesc(""); setOpenProject(false);
    qc.invalidateQueries();
  }

  async function createTask(projectId: string) {
    if (!tTitle) return toast.error("Title required");
    const { error } = await supabase.from("tasks").insert({ project_id: projectId, title: tTitle, description: tDesc || null, due_date: tDue || null, priority: tPri, assignee_id: tAssign || null, created_by: me!.realId });
    if (error) return toast.error(error.message);
    toast.success("Task assigned");
    setTTitle(""); setTDesc(""); setTDue(""); setTAssign(""); setOpenTask(null);
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">{me?.canManageProjects ? "Create projects and assign tasks to the team." : "Projects you can log time against."}</p>
        </div>
        {me?.canManageProjects && (
          <Dialog open={openProject} onOpenChange={setOpenProject}>
            <DialogTrigger asChild><Button className="gradient-primary"><Plus className="h-4 w-4 mr-1" /> New project</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">New project</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Project ID</Label><Input placeholder="CLDM00XXX" value={pCode} onChange={(e) => setPCode(e.target.value)} /></div>
                  <div className="space-y-1"><Label>Name</Label><Input value={pName} onChange={(e) => setPName(e.target.value)} /></div>
                </div>
                <div className="space-y-1"><Label>Client</Label><Input value={pClient} onChange={(e) => setPClient(e.target.value)} /></div>
                <div className="space-y-1"><Label>Description</Label><Textarea rows={3} value={pDesc} onChange={(e) => setPDesc(e.target.value)} /></div>
                <div className="space-y-1"><Label>Status</Label>
                  <Select value={pStatus} onValueChange={(v) => setPStatus(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="on_hold">On Hold</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={createProject} className="gradient-primary">Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </header>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, project ID, or client" className="pl-9" />
      </div>

      {(() => {
        const q = search.trim().toLowerCase();
        const filtered = q
          ? (projects ?? []).filter((p: any) =>
              [p.name, p.code, p.client_name].some((v) => (v ?? "").toString().toLowerCase().includes(q)),
            )
          : (projects ?? []);
        return (<>
      {(projects?.length ?? 0) === 0 && <Card><CardContent className="p-10 text-center text-muted-foreground">No projects yet.</CardContent></Card>}
      {(projects?.length ?? 0) > 0 && filtered.length === 0 && <Card><CardContent className="p-10 text-center text-muted-foreground">No projects match "{search}".</CardContent></Card>}

      <div className="grid gap-4">
        {filtered.map((p: any) => (
          <Card key={p.id}>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="font-display flex items-center gap-2"><FolderKanban className="h-4 w-4 text-primary" />{p.name}</CardTitle>
                <CardDescription><span className="font-mono text-xs mr-2">{p.code}</span>· {p.client_name ?? "Internal"} · <Badge variant="outline" className="capitalize ml-1">{p.status.replace("_", " ")}</Badge></CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {me?.canManageProjects && (
                  <Button size="sm" variant="outline" onClick={() => setEditProject(p)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
                )}
                {me?.canManageProjects && (
                  <Button size="sm" variant="outline" onClick={() => setLogFor({ id: p.id, code: p.code, name: p.name })}><Clock className="h-4 w-4 mr-1" /> Time log</Button>
                )}

                {me?.canManageProjects && (
                  <Dialog open={openTask === p.id} onOpenChange={(o) => setOpenTask(o ? p.id : null)}>
                    <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Task</Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle className="font-display">Assign task in {p.name}</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <div className="space-y-1"><Label>Title</Label><Input value={tTitle} onChange={(e) => setTTitle(e.target.value)} /></div>
                        <div className="space-y-1"><Label>Description</Label><Textarea rows={2} value={tDesc} onChange={(e) => setTDesc(e.target.value)} /></div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1"><Label>Due date</Label><Input type="date" value={tDue} onChange={(e) => setTDue(e.target.value)} /></div>
                          <div className="space-y-1"><Label>Priority</Label>
                            <Select value={tPri} onValueChange={(v) => setTPri(v as any)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1"><Label>Assign to</Label>
                          <Select value={tAssign} onValueChange={setTAssign}>
                            <SelectTrigger><SelectValue placeholder="Team member" /></SelectTrigger>
                            <SelectContent>{people?.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter><Button onClick={() => createTask(p.id)} className="gradient-primary">Assign</Button></DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {p.description && <p className="text-sm text-muted-foreground mb-3">{p.description}</p>}
              <div className="grid gap-3 md:grid-cols-3">
                {(["todo","in_progress","done"] as const).map((col) => (
                  <div key={col} className="rounded-lg border border-border/60 bg-surface/40 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{col.replace("_"," ")}</div>
                    <div className="space-y-2">
                      {(p.tasks ?? []).filter((t: any) => t.status === col).map((t: any) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setOpenTaskId(t.id)}
                          className="w-full text-left rounded-md border border-border/60 bg-card p-2 text-sm hover:bg-accent/40 transition-colors"
                        >
                          <div className="font-medium">{t.title}</div>
                          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{t.assignee?.full_name ?? "Unassigned"}</span>
                            <Badge variant="outline" className="capitalize">{t.priority}</Badge>
                          </div>
                        </button>
                      ))}
                      {(p.tasks ?? []).filter((t: any) => t.status === col).length === 0 && <div className="text-xs text-muted-foreground">—</div>}
                    </div>
                  </div>
                ))}
              </div>
              {me?.isSuperAdmin && (() => {
                const s = paySummary(p.id);
                return (
                  <div className="mt-3 flex items-center justify-between rounded-lg border border-border/60 bg-surface/40 p-2 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Wallet className="h-3.5 w-3.5" /> Vendor payments
                    </div>
                    <div className="flex items-center gap-3">
                      <span>Pending: <span className="font-semibold text-foreground">₹ {s.pending.toLocaleString("en-IN")}</span></span>
                      <span>Paid: <span className="font-semibold text-foreground">₹ {s.paid.toLocaleString("en-IN")}</span></span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>

          </Card>
        ))}
      </div>
        </>);
      })()}

      <Dialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Time log · {logFor?.name}</DialogTitle>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                <span className="font-mono">{logFor?.code}</span> ·{" "}
                <span title="All punched hours on this project, regardless of manager approval">Logged: <span className="font-semibold text-foreground">{loggedTotal.toFixed(2)} h</span></span> ·{" "}
                <span title="Manager-approved days only — the figure that feeds Project Burn and Finances">Approved: <span className={`font-semibold ${approvedTotal < loggedTotal ? "text-amber-700" : "text-foreground"}`}>{approvedTotal.toFixed(2)} h</span></span>
                {me?.isFinanceAdmin && (
                  <> · <span title="Approved-hours-based salary-share burn for this project, same math as Project Burn">Total burn: <span className="font-semibold text-foreground">{inr(projectBurnTotal)}</span></span></>
                )}
                {" "}across {timeLog?.length ?? 0} entries
              </div>
              <div className="text-[11px] text-muted-foreground/80 leading-snug">
                <span className="font-medium">Legend:</span> <b>Logged</b> = raw punched hours (unfiltered). <b>Approved</b> = only days a manager marked approved; burn and finances use this.
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {(timeLog?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No time logged on this project yet.</p>}
            {timeLog?.map((r, i) => (
              <div key={i} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="font-medium">{r.user}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{format(new Date(r.date), "EEE, MMM d")}</span>
                    {(() => {
                      const apr = r.approvedHours;
                      const reduced = r.approved && apr != null && apr !== r.hours;
                      if (reduced) {
                        return (
                          <Badge
                            variant="outline"
                            className="text-amber-700 border-amber-500/60"
                            title="Manager approved fewer (or more) hours than were logged for this row"
                          >
                            {r.hours.toFixed(2)}h logged → {apr!.toFixed(2)}h approved
                          </Badge>
                        );
                      }
                      return (
                        <>
                          <Badge variant="outline">{r.hours.toFixed(2)}h logged</Badge>
                          {r.approved
                            ? <Badge variant="secondary" className="text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-300">approved</Badge>
                            : <Badge variant="outline" className="text-amber-700 border-amber-500/60">pending approval</Badge>}
                        </>
                      );
                    })()}
                  </div>
                </div>
                {r.comments && <div className="mt-1 text-xs text-muted-foreground">{r.comments}</div>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <EditProjectDialog project={editProject} onClose={() => setEditProject(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["projects"] })} />

      <TaskDetailSheet
        taskId={openTaskId}
        onClose={(next) => {
          setOpenTaskId(next ?? null);
          qc.invalidateQueries({ queryKey: ["projects"] });
        }}
      />
    </div>
  );
}

function EditProjectDialog({ project, onClose, onSaved }: { project: any | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<"active"|"on_hold"|"completed">("active");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useMemo(() => {
    setCode(project?.code ?? "");
    setName(project?.name ?? "");
    setClient(project?.client_name ?? "");
    setDesc(project?.description ?? "");
    setStatus((project?.status ?? "active") as any);
    setStart(project?.start_date ?? "");
    setEnd(project?.end_date ?? "");
  }, [project]);

  async function save() {
    if (!project) return;
    if (!code.trim()) return toast.error("Project ID required");
    if (!name.trim()) return toast.error("Name required");
    const { error } = await supabase.from("projects").update({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      client_name: client.trim() || null,
      description: desc.trim() || null,
      status,
      start_date: start || null,
      end_date: end || null,
    }).eq("id", project.id);
    if (error) return toast.error(error.message);
    toast.success("Project updated");
    onSaved();
    onClose();
  }

  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">Edit project</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Project ID</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
            <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Client</Label><Input value={client} onChange={(e) => setClient(e.target.value)} /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="on_hold">On Hold</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Start date</Label><Input type="date" value={start ?? ""} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1"><Label>End date</Label><Input type="date" value={end ?? ""} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter><Button onClick={save} className="gradient-primary">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

