import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { TableProperties, Download, CalendarIcon, ChevronLeft, ChevronRight, CheckCircle2, MoreHorizontal, Plus, Trash2, Pencil, Check, X, Clock } from "lucide-react";
import { MultiSelectFilter, UNASSIGNED } from "@/components/multi-select-filter";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { DayEditorSheet } from "@/components/day-editor-sheet";
import { useVisibilityScope } from "@/hooks/use-visibility-scope";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({ date: z.string().optional() });

export const Route = createFileRoute("/_authenticated/timesheet")({
  validateSearch: searchSchema,
  component: TimesheetPage,
});

type Profile = { id: string; full_name: string | null; email: string | null; department: string | null };
type Task = { project_code?: string; project_name?: string; hours?: number; approved_hours?: number; comments?: string };
type LogRow = { id: string; user_id: string; date: string; tasks: Task[] | null; approved_at: string | null; approved_by: string | null };
type Project = { code: string; name: string };

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseYmd(s: string) {
  return new Date(`${s}T00:00:00`);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function TimesheetPage() {
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const navigate = useNavigate({ from: "/timesheet" });
  const search = useSearch({ from: "/_authenticated/timesheet" });
  const qc = useQueryClient();

  const day = useMemo(() => (search.date ? parseYmd(search.date) : new Date()), [search.date]);
  const setDay = (d: Date) => navigate({ search: { date: ymd(d) }, replace: true });

  const [deptSel, setDeptSel] = useState<Set<string>>(new Set());
  const [projSel, setProjSel] = useState<Set<string>>(new Set());
  const [empSel, setEmpSel] = useState<Set<string>>(new Set());
  const [showEmpty, setShowEmpty] = useState(false);
  const [editor, setEditor] = useState<{ userId: string; userName: string; date: string } | null>(null);

  useEffect(() => {
    if (!meLoading && me && !(me.isAdmin || me.canManageProjects || me.isDepartmentHead || me.isReportingManager)) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [me, meLoading, navigate]);

  const canView = !!me && (me.isAdmin || me.canManageProjects || me.isDepartmentHead || me.isReportingManager);
  const canEdit = !!me && (me.isSuperAdmin || me.isAdmin || me.canManageProjects || me.isDepartmentHead || me.isReportingManager);
  const canApprove = canEdit;
  const { deptScope, userScope } = useVisibilityScope(me);

  const dateIso = ymd(day);
  const nextDayIso = ymd(addDays(day, 1));
  const dateLabel = format(day, "EEEE, d MMM yyyy");

  const { data: profiles } = useQuery({
    queryKey: ["ts-profiles", deptScope?.join(",") ?? "all", userScope?.join(",") ?? "all"],
    enabled: canView,
    queryFn: async () => {
      let q = supabase.from("profiles").select("id, full_name, email, department");
      if (deptScope && deptScope.length) q = q.in("department", deptScope);
      if (userScope && userScope.length) q = q.in("id", userScope);
      return (await q).data as Profile[] ?? [];
    },
  });

  const visibleUserIds = useMemo(() => (profiles ?? []).map((p) => p.id), [profiles]);
  const hasScope = !!deptScope || !!userScope;

  const { data: logs, refetch: refetchLogs } = useQuery({
    queryKey: ["ts-logs", dateIso, hasScope ? visibleUserIds.join(",") : "all"],
    enabled: canView && (!hasScope || visibleUserIds.length > 0),
    queryFn: async () => {
      let q = supabase
        .from("attendance_logs")
        .select("id, user_id, date, tasks, approved_at, approved_by")
        .gte("date", dateIso).lt("date", nextDayIso);
      if (hasScope) q = q.in("user_id", visibleUserIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const { data: projectsAll } = useQuery({
    queryKey: ["ts-projects-all"],
    enabled: canView,
    queryFn: async () => (await supabase.from("projects").select("code, name").order("code")).data as Project[] ?? [],
  });

  // Direct reports of the current user — they can approve their reports' task-hour logs.
  const directReportIds = me?.directReportIds ?? [];
  const { data: pendingHours, refetch: refetchPending } = useQuery({
    queryKey: ["ts-pending-task-hours", me?.id, directReportIds.join(",")],
    enabled: !!me?.id && directReportIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_activity" as never)
        .select("id, task_id, actor_id, hours, note, completion_date, created_at, kind, task:tasks(id, title, project:projects(id, code, name)), actor:profiles!task_activity_actor_id_fkey(id, full_name, email)")
        .eq("approval_status", "pending")
        .not("hours", "is", null)
        .in("actor_id", directReportIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as Array<{
        id: string; task_id: string; actor_id: string; hours: number | null; note: string | null;
        completion_date: string | null; created_at: string; kind: string;
        task: { id: string; title: string | null; project: { code: string | null; name: string | null } | null } | null;
        actor: { id: string; full_name: string | null; email: string | null } | null;
      }>);
    },
  });

  async function decidePending(id: string, decide: "approved" | "rejected", reason?: string, approvedHours?: number | null) {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const myId = userRes.user?.id ?? null;
      const patch: Record<string, unknown> = {
        approval_status: decide,
        approved_by: myId,
        approved_at: new Date().toISOString(),
        approved_hours: decide === "approved" ? (approvedHours ?? null) : null,
      };
      if (decide === "rejected") patch.rejected_reason = reason ?? null;
      const { error } = await supabase.from("task_activity" as never).update(patch as never).eq("id", id);
      if (error) throw error;
      toast.success(decide === "approved" ? "Approved" : "Rejected");
      await refetchPending();
      qc.invalidateQueries({ queryKey: ["my-ts-activity"] });
      qc.invalidateQueries({ queryKey: ["my-performance"] });
      qc.invalidateQueries({ queryKey: ["pb-activity"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const projectByCode = useMemo(() => new Map((projectsAll ?? []).map((p) => [p.code, p])), [projectsAll]);

  const profileById = useMemo(() => new Map((profiles ?? []).map((p) => [p.id, p])), [profiles]);
  const logByUser = useMemo(() => new Map((logs ?? []).map((r) => [r.user_id, r])), [logs]);

  // Projects that actually appear in the day (for filter list).
  const projectsInDay = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of logs ?? []) for (const t of r.tasks ?? []) {
      const code = t.project_code?.trim();
      if (code && !m.has(code)) m.set(code, t.project_name || code);
    }
    return Array.from(m.entries()).map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code));
  }, [logs]);

  const allDepts = useMemo(() => {
    const s = new Set<string>();
    for (const p of profiles ?? []) if (p.department) s.add(p.department);
    return Array.from(s).sort();
  }, [profiles]);

  // Build rows: employees (filtered) with their tasks for the day.
  type EmpRow = { profile: Profile; log: LogRow | null; tasks: Task[]; approved: boolean; total: number; approvedTotal: number };
  const empRows = useMemo<EmpRow[]>(() => {
    const src = (profiles ?? []).filter((p) => {
      if (deptSel.size > 0) {
        const d = p.department;
        if (!(d ? deptSel.has(d) : deptSel.has(UNASSIGNED))) return false;
      }
      if (empSel.size > 0 && !empSel.has(p.id)) return false;
      return true;
    });
    const out: EmpRow[] = src.map((p) => {
      const log = logByUser.get(p.id) ?? null;
      let tasks: Task[] = (log?.tasks ?? []).map((t) => ({ ...t }));
      if (projSel.size > 0) tasks = tasks.filter((t) => t.project_code && projSel.has(t.project_code));
      const total = tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
      const approvedTotal = !!log?.approved_at
        ? tasks.reduce((s, t) => s + (t.approved_hours != null ? Number(t.approved_hours) : (Number(t.hours) || 0)), 0)
        : 0;
      return { profile: p, log, tasks, approved: !!log?.approved_at, total, approvedTotal };
    });
    return out
      .filter((r) => showEmpty || r.tasks.length > 0)
      .sort((a, b) =>
        (a.profile.full_name ?? a.profile.email ?? "").localeCompare(b.profile.full_name ?? b.profile.email ?? "")
      );
  }, [profiles, logByUser, deptSel, empSel, projSel, showEmpty]);

  const dayTotal = useMemo(() => empRows.reduce((s, r) => s + r.total, 0), [empRows]);
  const dayApprovedTotal = useMemo(() => empRows.reduce((s, r) => s + r.approvedTotal, 0), [empRows]);
  const entryCount = useMemo(() => empRows.reduce((s, r) => s + r.tasks.length, 0), [empRows]);

  async function persistTasks(userId: string, existing: LogRow | null, newTasks: Task[], opts?: { approvedAt?: string | null; approvedBy?: string | null }) {
    const cleaned = newTasks
      .filter((r) => r.project_code && Number(r.hours) > 0)
      .map((r) => ({
        project_code: r.project_code,
        project_name: r.project_name || projectByCode.get(r.project_code!)?.name || r.project_code,
        hours: Number(r.hours) || 0,
        approved_hours: r.approved_hours != null && !Number.isNaN(Number(r.approved_hours))
          ? Number(r.approved_hours) : undefined,
        comments: r.comments?.trim() || undefined,
      }));
    const totalHrs = cleaned.reduce((s, r) => s + (r.hours ?? 0), 0);
    const isApprovedNow = opts && "approvedAt" in opts
      ? !!opts.approvedAt
      : !!existing?.approved_at;
    const approvedHrs = isApprovedNow
      ? cleaned.reduce((s, r) => s + (r.approved_hours ?? r.hours ?? 0), 0)
      : null;
    const { data: userRes } = await supabase.auth.getUser();
    const myId = userRes.user?.id ?? null;

    if (existing?.id) {
      const patch = { tasks: cleaned, total_hours: totalHrs, logged_hours: totalHrs, approved_hours: approvedHrs, last_edited_by: myId,
        ...(opts && "approvedAt" in opts ? { approved_at: opts.approvedAt ?? null, approved_by: opts.approvedBy ?? null } : {}) };
      const { error } = await supabase.from("attendance_logs").update(patch as never).eq("id", existing.id);
      if (error) throw error;
    } else {
      const insert = { user_id: userId, date: dateIso, tasks: cleaned, total_hours: totalHrs, logged_hours: totalHrs, approved_hours: approvedHrs, last_edited_by: myId,
        ...(opts && "approvedAt" in opts ? { approved_at: opts.approvedAt ?? null, approved_by: opts.approvedBy ?? null } : {}) };
      const { error } = await supabase.from("attendance_logs").insert(insert as never);
      if (error) throw error;
    }
  }

  async function updateTask(row: EmpRow, taskIndex: number, patch: Partial<Task>) {
    // Task index refers to filtered tasks; map back to full task list.
    const full = (row.log?.tasks ?? []).map((t) => ({ ...t }));
    // Find nth match matching current filter
    let matchIdx = -1, seen = -1;
    for (let i = 0; i < full.length; i++) {
      const t = full[i];
      const passes = projSel.size === 0 || (t.project_code && projSel.has(t.project_code));
      if (passes) { seen++; if (seen === taskIndex) { matchIdx = i; break; } }
    }
    if (matchIdx < 0) return;
    full[matchIdx] = { ...full[matchIdx], ...patch };
    if (patch.project_code) full[matchIdx].project_name = projectByCode.get(patch.project_code)?.name || patch.project_code;
    try {
      await persistTasks(row.profile.id, row.log, full);
      await refetchLogs();
      qc.invalidateQueries({ queryKey: ["my-ts-logs"] });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function deleteTask(row: EmpRow, taskIndex: number) {
    const full = (row.log?.tasks ?? []).map((t) => ({ ...t }));
    let matchIdx = -1, seen = -1;
    for (let i = 0; i < full.length; i++) {
      const t = full[i];
      const passes = projSel.size === 0 || (t.project_code && projSel.has(t.project_code));
      if (passes) { seen++; if (seen === taskIndex) { matchIdx = i; break; } }
    }
    if (matchIdx < 0) return;
    full.splice(matchIdx, 1);
    try {
      await persistTasks(row.profile.id, row.log, full);
      await refetchLogs();
      qc.invalidateQueries({ queryKey: ["my-ts-logs"] });
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function addTask(row: EmpRow, code: string, hours: number) {
    if (!code || hours <= 0) return;
    const full = [...(row.log?.tasks ?? []).map((t) => ({ ...t })), { project_code: code, project_name: projectByCode.get(code)?.name || code, hours }];
    try {
      await persistTasks(row.profile.id, row.log, full);
      await refetchLogs();
      qc.invalidateQueries({ queryKey: ["my-ts-logs"] });
      toast.success("Added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add failed");
    }
  }

  async function toggleApproval(row: EmpRow) {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const myId = userRes.user?.id ?? null;
      if (row.approved) {
        await persistTasks(row.profile.id, row.log, row.log?.tasks ?? [], { approvedAt: null, approvedBy: null });
      } else {
        await persistTasks(row.profile.id, row.log, row.log?.tasks ?? [], { approvedAt: new Date().toISOString(), approvedBy: myId });
      }
      await refetchLogs();
      qc.invalidateQueries({ queryKey: ["my-ts-logs"] });
      toast.success(row.approved ? "Unapproved" : "Approved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    }
  }

  function exportCsv() {
    const header = ["Employee", "Email", "Department", "Project Code", "Project", "Hours", "Notes", "Status"];
    const rows: string[][] = [];
    for (const r of empRows) {
      if (r.tasks.length === 0) {
        rows.push([r.profile.full_name ?? "", r.profile.email ?? "", r.profile.department ?? "", "", "", "0", "", r.approved ? "Approved" : "Pending"]);
        continue;
      }
      for (const t of r.tasks) {
        rows.push([
          r.profile.full_name ?? "", r.profile.email ?? "", r.profile.department ?? "",
          t.project_code ?? "", t.project_name ?? "",
          String(t.hours ?? 0), t.comments ?? "", r.approved ? "Approved" : "Pending",
        ]);
      }
    }
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `timesheet-${dateIso}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (meLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!canView) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <TableProperties className="h-6 w-6 text-primary" /> Timesheet
          </h1>
          <p className="text-sm text-muted-foreground">Daily hours per employee. Edit any row inline — no month/range juggling.</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 min-w-[220px] justify-start">
                  <CalendarIcon className="h-4 w-4 mr-2" /> {dateLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={day} onSelect={(d) => d && setDay(d)} defaultMonth={day} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setDay(addDays(day, 1))} aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setDay(new Date())}>Today</Button>
          </div>

          <MultiSelectFilter label="Department" options={allDepts.map((d) => ({ value: d, label: d }))} selected={deptSel} onChange={setDeptSel} includeUnassigned />
          <MultiSelectFilter label="Employee" options={(profiles ?? []).map((p) => ({ value: p.id, label: p.full_name ?? p.email ?? "—", sub: p.email ?? undefined }))} selected={empSel} onChange={setEmpSel} />
          <MultiSelectFilter label="Projects" options={projectsInDay.map((p) => ({ value: p.code, label: p.name, sub: p.code }))} selected={projSel} onChange={setProjSel} />
          <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={empRows.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>{dateLabel}</CardTitle>
            <CardDescription>
              {empRows.length} employee{empRows.length === 1 ? "" : "s"} · {entryCount} entr{entryCount === 1 ? "y" : "ies"} · Logged {dayTotal.toFixed(1)} hrs · Approved {dayApprovedTotal.toFixed(1)} hrs{dayApprovedTotal < dayTotal ? ` · Gap ${(dayTotal - dayApprovedTotal).toFixed(1)} hrs` : ""}
            </CardDescription>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <Checkbox checked={showEmpty} onCheckedChange={(v) => setShowEmpty(!!v)} />
            Show employees with no entries
          </label>
        </CardHeader>
        <CardContent>
          {empRows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 text-center">No entries for this day.</div>
          ) : (
            <div className="overflow-auto max-h-[75vh] border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="min-w-[220px]">Employee</TableHead>
                    <TableHead className="min-w-[240px]">Project</TableHead>
                    <TableHead className="w-[110px] text-right">Hours</TableHead>
                    <TableHead className="min-w-[200px]">Notes</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empRows.map((row) => (
                    <EmployeeBlock
                      key={row.profile.id}
                      row={row}
                      projects={projectsAll ?? []}
                      canEdit={canEdit}
                      canApprove={canApprove}
                      onUpdate={(i, p) => updateTask(row, i, p)}
                      onDelete={(i) => deleteTask(row, i)}
                      onAdd={(code, hrs) => addTask(row, code, hrs)}
                      onToggleApproval={() => toggleApproval(row)}
                      onOpenFull={() => setEditor({ userId: row.profile.id, userName: row.profile.full_name ?? row.profile.email ?? "—", date: dateIso })}
                    />
                  ))}
                  <TableRow className="border-t-2 bg-muted/30">
                    <TableCell className="font-semibold">Day total</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-bold font-mono">{dayTotal.toFixed(1)}</TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {directReportIds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Task hours awaiting your approval
              {pendingHours && pendingHours.length > 0 && (
                <Badge variant="outline" className="ml-1">{pendingHours.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>Hours logged on tasks by people who report to you. Approve or reject each entry.</CardDescription>
          </CardHeader>
          <CardContent>
            {!pendingHours || pendingHours.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Nothing pending. Nice.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Task / Project</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Logged</TableHead>
                    <TableHead className="text-right w-[110px]">Approve</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="w-[180px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingHours.map((r) => {
                    const date = r.completion_date ?? r.created_at.slice(0, 10);
                    const proj = r.task?.project;
                    const logged = Number(r.hours ?? 0);
                    return (
                      <PendingRow
                        key={r.id}
                        id={r.id}
                        name={r.actor?.full_name ?? r.actor?.email ?? "—"}
                        title={r.task?.title ?? "Task"}
                        projCode={proj?.code ?? null}
                        projName={proj?.name ?? null}
                        date={date}
                        logged={logged}
                        note={r.note}
                        onDecide={decidePending}
                      />
                    );
                  })}
                </TableBody>
              </Table>

            )}
          </CardContent>
        </Card>
      )}


      {editor && (
        <DayEditorSheet
          open={!!editor}
          onOpenChange={(o) => { if (!o) { setEditor(null); refetchLogs(); } }}
          userId={editor.userId}
          userName={editor.userName}
          date={editor.date}
          canEdit={canEdit}
          canApprove={canApprove}
        />
      )}
    </div>
  );
}

function EmployeeBlock({
  row, projects, canEdit, canApprove,
  onUpdate, onDelete, onAdd, onToggleApproval, onOpenFull,
}: {
  row: { profile: Profile; log: LogRow | null; tasks: Task[]; approved: boolean; total: number };
  projects: Project[];
  canEdit: boolean;
  canApprove: boolean;
  onUpdate: (taskIndex: number, patch: Partial<Task>) => void;
  onDelete: (taskIndex: number) => void;
  onAdd: (code: string, hours: number) => void;
  onToggleApproval: () => void;
  onOpenFull: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addCode, setAddCode] = useState("");
  const [addHrs, setAddHrs] = useState("");
  const name = row.profile.full_name ?? row.profile.email ?? "—";
  const dept = row.profile.department;
  const locked = row.approved && !canApprove;
  const mayEdit = (canEdit && !row.approved) || canApprove;
  const rowspan = Math.max(1, row.tasks.length) + (mayEdit && addOpen ? 1 : 0) + 1; // + summary/add trigger

  return (
    <>
      {row.tasks.length === 0 ? (
        <TableRow>
          <TableCell>
            <div className="font-medium">{name}</div>
            {dept && <div className="text-[10px] text-muted-foreground">{dept}</div>}
          </TableCell>
          <TableCell colSpan={3}>
            <span className="text-sm text-muted-foreground italic">No entries</span>
          </TableCell>
          <TableCell>
            <Badge variant="outline">Pending</Badge>
          </TableCell>
          <TableCell>
            <RowMenu canApprove={canApprove} approved={row.approved} onToggleApproval={onToggleApproval} onOpenFull={onOpenFull} />
          </TableCell>
        </TableRow>
      ) : (
        row.tasks.map((t, i) => (
          <TableRow key={`${row.profile.id}-${i}`}>
            {i === 0 && (
              <TableCell rowSpan={rowspan} className="align-top border-r">
                <div className="font-medium">{name}</div>
                {dept && <div className="text-[10px] text-muted-foreground">{dept}</div>}
                <div className="mt-2 text-xs font-mono">Total: <span className="font-bold">{row.total.toFixed(1)}</span></div>
              </TableCell>
            )}
            <TableCell>
              <Select value={t.project_code ?? ""} onValueChange={(v) => onUpdate(i, { project_code: v })} disabled={!mayEdit}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Pick project" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {projects.map((p) => <SelectItem key={p.code} value={p.code}>{p.code} · {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell className="text-right">
              <InlineNumber value={Number(t.hours) || 0} disabled={!mayEdit} onCommit={(v) => onUpdate(i, { hours: v })} />
            </TableCell>
            <TableCell>
              <InlineText value={t.comments ?? ""} disabled={!mayEdit} onCommit={(v) => onUpdate(i, { comments: v })} placeholder="Optional" />
            </TableCell>
            {i === 0 && (
              <TableCell rowSpan={rowspan} className="align-top">
                {row.approved
                  ? <Badge variant="secondary" className="gap-1 text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-300"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>
                  : <Badge variant="outline">Pending</Badge>}
                {locked && <div className="text-[10px] text-muted-foreground mt-1">Locked</div>}
              </TableCell>
            )}
            <TableCell>
              <div className="flex items-center gap-1 justify-end">
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!mayEdit} onClick={() => onDelete(i)} aria-label="Delete row">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                {i === 0 && <RowMenu canApprove={canApprove} approved={row.approved} onToggleApproval={onToggleApproval} onOpenFull={onOpenFull} />}
              </div>
            </TableCell>
          </TableRow>
        ))
      )}
      {mayEdit && row.tasks.length > 0 && addOpen && (
        <TableRow className="bg-muted/20">
          <TableCell>
            <Select value={addCode} onValueChange={setAddCode}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Pick project" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {projects.map((p) => <SelectItem key={p.code} value={p.code}>{p.code} · {p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </TableCell>
          <TableCell className="text-right">
            <Input type="number" min={0} step={0.25} value={addHrs} onChange={(e) => setAddHrs(e.target.value)} className="h-8 text-right font-mono" placeholder="0" />
          </TableCell>
          <TableCell colSpan={2}>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => {
                const h = Number(addHrs);
                if (!addCode || !h || h <= 0) { toast.error("Pick a project and enter hours"); return; }
                onAdd(addCode, h);
                setAddCode(""); setAddHrs(""); setAddOpen(false);
              }}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAddOpen(false); setAddCode(""); setAddHrs(""); }}>Cancel</Button>
            </div>
          </TableCell>
        </TableRow>
      )}
      {mayEdit && row.tasks.length > 0 && !addOpen && (
        <TableRow>
          <TableCell colSpan={3}>
            <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add project
            </Button>
          </TableCell>
          <TableCell />
        </TableRow>
      )}
    </>
  );
}

function RowMenu({ canApprove, approved, onToggleApproval, onOpenFull }: { canApprove: boolean; approved: boolean; onToggleApproval: () => void; onOpenFull: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onOpenFull}>
          <Pencil className="h-4 w-4 mr-2" /> Open full editor
        </DropdownMenuItem>
        {canApprove && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onToggleApproval}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> {approved ? "Unapprove day" : "Approve day"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InlineNumber({ value, disabled, onCommit }: { value: number; disabled?: boolean; onCommit: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  return (
    <Input
      type="number" min={0} step={0.25} value={v} disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { const n = Number(v); if (!isNaN(n) && n !== value) onCommit(n); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-8 text-right font-mono"
    />
  );
}

function InlineText({ value, disabled, onCommit, placeholder }: { value: string; disabled?: boolean; onCommit: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <Input
      value={v} disabled={disabled} placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onCommit(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-8"
    />
  );
}

function PendingRow({
  id, name, title, projCode, projName, date, logged, note, onDecide,
}: {
  id: string; name: string; title: string;
  projCode: string | null; projName: string | null;
  date: string; logged: number; note: string | null;
  onDecide: (id: string, decide: "approved" | "rejected", reason?: string, approvedHours?: number | null) => void;
}) {
  const [approve, setApprove] = useState<string>(String(logged));
  const approveNum = Number(approve);
  const valid = !Number.isNaN(approveNum) && approveNum >= 0 && approveNum <= logged;
  const reduced = valid && approveNum < logged;
  return (
    <TableRow>
      <TableCell className="text-sm">{name}</TableCell>
      <TableCell className="text-sm">
        <div>{title}</div>
        {projCode && <div className="text-[10px] text-muted-foreground font-mono">{projCode} · {projName}</div>}
      </TableCell>
      <TableCell className="text-xs">{format(new Date(date + "T00:00:00"), "d MMM")}</TableCell>
      <TableCell className="text-right font-mono">{logged.toFixed(2)}</TableCell>
      <TableCell className="text-right">
        <Input
          type="number" min={0} max={logged} step={0.25}
          value={approve}
          onChange={(e) => setApprove(e.target.value)}
          className={`h-8 text-right font-mono ${!valid ? "border-destructive/60" : reduced ? "border-amber-500/60" : ""}`}
        />
        {reduced && <div className="text-[10px] text-amber-700 mt-0.5">Approving {approveNum} of {logged}</div>}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">{note ?? ""}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center gap-1 justify-end">
          <Button size="sm" variant="outline" className="h-7"
            disabled={!valid}
            onClick={() => onDecide(id, "approved", undefined, approveNum)}>
            <Check className="h-3.5 w-3.5 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-destructive"
            onClick={() => {
              const reason = window.prompt("Reason for rejection (optional):") ?? undefined;
              onDecide(id, "rejected", reason || undefined);
            }}>
            <X className="h-3.5 w-3.5 mr-1" /> Reject
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

