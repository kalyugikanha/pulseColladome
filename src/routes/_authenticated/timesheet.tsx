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
import { TableProperties, Download, CalendarIcon, ChevronLeft, ChevronRight, CheckCircle2, MoreHorizontal, Plus, Trash2, Pencil, StickyNote } from "lucide-react";
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
type Task = {
  project_code?: string;
  project_name?: string;
  hours?: number;
  approved_hours?: number;
  logged_hours?: number;
  comments?: string;
  approval_note?: string;
  task_id?: string;
  task_title?: string;
};
type LogRow = { id: string; user_id: string; date: string; tasks: Task[] | null; approved_at: string | null; approved_by: string | null };
type Project = { code: string; name: string };
type UserTask = { id: string; title: string | null; project_id: string | null };


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
  const search = useSearch({ strict: false }) as { userId?: string; date?: string };
  const qc = useQueryClient();

  const day = useMemo(() => (search.date ? parseYmd(search.date) : new Date()), [search.date]);
  const setDay = (d: Date) => navigate({ search: { date: ymd(d) }, replace: true });

  const [deptSel, setDeptSel] = useState<Set<string>>(new Set());
  const [projSel, setProjSel] = useState<Set<string>>(new Set());
  const [taskSel, setTaskSel] = useState<Set<string>>(new Set());
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
  const prevDayIso = ymd(addDays(day, -1));
  const nextDayIso = ymd(addDays(day, 1));
  const afterNextDayIso = ymd(addDays(day, 2));
  const dateLabel = format(day, "EEEE, d MMM yyyy");

  // Visibility model shared with the Pending panel:
  // - People-unscoped (admin / super admin / HR / finance): see everyone in
  //   the current scope (or all when no scope is set).
  // - Everyone else (dept heads / reporting managers / PMs): scoped to their
  //   reporting tree via useVisibilityScope, which is now narrow by default.
  const directReportIds = me?.directReportIds ?? [];
  const pendingIsAdmin = !!me && me.isPeopleUnscoped;
  const hasScope = !!deptScope || !!userScope;
  // IDs to restrict profiles/activity to when no dept/user scope is set.
  const fallbackActorIds: string[] | null = pendingIsAdmin ? null : directReportIds;
  const fallbackKey = fallbackActorIds ? fallbackActorIds.join(",") : "all";

  const { data: profiles } = useQuery({
    queryKey: ["ts-profiles", deptScope?.join(",") ?? "all", userScope?.join(",") ?? "all", hasScope ? "scoped" : fallbackKey],
    enabled: canView && !!me?.id,
    queryFn: async () => {
      let q = supabase.from("profiles").select("id, full_name, email, department");
      if (deptScope && deptScope.length) q = q.in("department", deptScope);
      if (userScope && userScope.length) q = q.in("id", userScope);
      if (!hasScope && fallbackActorIds) {
        if (fallbackActorIds.length === 0) return [] as Profile[];
        q = q.in("id", fallbackActorIds);
      }
      return (await q).data as Profile[] ?? [];
    },
  });

  const visibleUserIds = useMemo(() => (profiles ?? []).map((p) => p.id), [profiles]);

  const { data: logs, refetch: refetchLogs } = useQuery({
    queryKey: ["ts-logs", dateIso, hasScope || fallbackActorIds ? visibleUserIds.join(",") : "all"],
    enabled: canView && ((!hasScope && !fallbackActorIds) || visibleUserIds.length > 0),
    queryFn: async () => {
      let q = supabase
        .from("attendance_logs")
        .select("id, user_id, date, tasks, approved_at, approved_by")
        .gte("date", dateIso).lt("date", nextDayIso);
      if (hasScope || fallbackActorIds) q = q.in("user_id", visibleUserIds);
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

  // Tasks visible in the day (for Task filter).
  const tasksInDay = useMemo(() => {
    const m = new Map<string, { title: string; code: string | null }>();
    for (const r of logs ?? []) for (const t of r.tasks ?? []) {
      const id = t.task_id;
      if (!id || m.has(id)) continue;
      m.set(id, { title: t.task_title ?? t.comments ?? "Task", code: t.project_code ?? null });
    }
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => a.title.localeCompare(b.title));
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
      if (taskSel.size > 0) tasks = tasks.filter((t) => t.task_id && taskSel.has(t.task_id));
      const total = tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
      const dayApproved = !!log?.approved_at;
      // Day-level approval is the source of truth. When the day is approved,
      // every row contributes its approved_hours (fallback: logged hours).
      const approvedTotal = dayApproved
        ? tasks.reduce((s, t) => s + (t.approved_hours != null ? Number(t.approved_hours) : (Number(t.hours) || 0)), 0)
        : 0;
      return { profile: p, log, tasks, approved: dayApproved, total, approvedTotal };
    });
    return out
      .filter((r) => showEmpty || r.tasks.length > 0)
      .sort((a, b) =>
        (a.profile.full_name ?? a.profile.email ?? "").localeCompare(b.profile.full_name ?? b.profile.email ?? "")
      );
  }, [profiles, logByUser, deptSel, empSel, projSel, taskSel, showEmpty]);




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
        approval_note: r.approval_note?.trim() || undefined,
        task_id: r.task_id || undefined,
        task_title: r.task_title || undefined,
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

  async function addTaskEntry(
    row: EmpRow,
    picked: { taskId: string; title: string; projectCode: string | null; projectName: string | null },
    hours: number,
  ) {
    if (!picked.taskId || hours <= 0) return;
    const code = picked.projectCode ?? "";
    const name = picked.projectName ?? (code ? projectByCode.get(code)?.name ?? code : "");
    const full = [
      ...(row.log?.tasks ?? []).map((t) => ({ ...t })),
      { project_code: code, project_name: name, hours, task_id: picked.taskId, task_title: picked.title },
    ];
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
    const header = ["Employee", "Email", "Department", "Task", "Project Code", "Project", "Hours", "Notes", "Status"];
    const rows: string[][] = [];
    for (const r of empRows) {
      if (r.tasks.length === 0) {
        rows.push([r.profile.full_name ?? "", r.profile.email ?? "", r.profile.department ?? "", "", "", "", "0", "", r.approved ? "Approved" : "Pending"]);
        continue;
      }
      for (const t of r.tasks) {
        const status = r.approved ? "Approved" : "Pending";
        rows.push([
          r.profile.full_name ?? "", r.profile.email ?? "", r.profile.department ?? "",
          t.task_title ?? "",
          t.project_code ?? "", t.project_name ?? "",
          String(t.hours ?? 0), t.comments ?? "", status,
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
          <MultiSelectFilter label="Task" options={tasksInDay.map((t) => ({ value: t.id, label: t.title, sub: t.code ?? undefined }))} selected={taskSel} onChange={setTaskSel} />

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
                    <TableHead className="min-w-[260px]">Task</TableHead>
                    <TableHead className="w-[110px] text-right tabular-nums">Hours</TableHead>
                    <TableHead className="w-[110px] text-right tabular-nums">Approved</TableHead>
                    <TableHead className="min-w-[180px]">Notes</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="w-[52px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empRows.map((row) => (
                    <EmployeeBlock
                      key={row.profile.id}
                      row={row}
                      canEdit={canEdit}
                      canApprove={canApprove}
                      onUpdate={(i, p) => updateTask(row, i, p)}
                      onDelete={(i) => deleteTask(row, i)}
                      onAdd={(picked, hrs) => addTaskEntry(row, picked, hrs)}
                      onToggleApproval={() => toggleApproval(row)}
                      onOpenFull={() => setEditor({ userId: row.profile.id, userName: row.profile.full_name ?? row.profile.email ?? "—", date: dateIso })}
                    />
                  ))}

                  <TableRow className="border-t-2 bg-muted/30">
                    <TableCell className="font-semibold">Day total</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      Approved {dayApprovedTotal.toFixed(1)} / Logged {dayTotal.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right text-lg font-bold tabular-nums">{dayTotal.toFixed(1)}<span className="text-xs font-normal text-muted-foreground ml-0.5">h</span></TableCell>
                    <TableCell className="text-right text-lg font-bold tabular-nums">{dayApprovedTotal.toFixed(1)}<span className="text-xs font-normal text-muted-foreground ml-0.5">h</span></TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>

                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>




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

type AddPicked = { taskId: string; title: string; projectCode: string | null; projectName: string | null };

function EmployeeBlock({
  row, canEdit, canApprove,
  onUpdate, onDelete, onAdd, onToggleApproval, onOpenFull,
}: {
  row: { profile: Profile; log: LogRow | null; tasks: Task[]; approved: boolean; total: number };
  canEdit: boolean;
  canApprove: boolean;
  onUpdate: (taskIndex: number, patch: Partial<Task>) => void;
  onDelete: (taskIndex: number) => void;
  onAdd: (picked: AddPicked, hours: number) => void;
  onToggleApproval: () => void;
  onOpenFull: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addTaskId, setAddTaskId] = useState("");
  const [addHrs, setAddHrs] = useState("");
  const name = row.profile.full_name ?? row.profile.email ?? "—";
  const dept = row.profile.department;
  const locked = row.approved && !canApprove;
  const mayEdit = (canEdit && !row.approved) || canApprove;
  const rowspan = Math.max(1, row.tasks.length) + (mayEdit && addOpen ? 1 : 0) + 1;

  // Tasks assignable to this employee, loaded on demand when they open the add row.
  const { data: userTasks } = useQuery({
    queryKey: ["ts-user-tasks", row.profile.id],
    enabled: addOpen,
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, project_id")
        .eq("assignee_id", row.profile.id)
        .order("created_at", { ascending: false })
        .limit(500);
      return (data ?? []) as UserTask[];
    },
  });
  const { data: projectsForAdd } = useQuery({
    queryKey: ["ts-projects-for-add"],
    enabled: addOpen,
    queryFn: async () => (await supabase.from("projects").select("id, code, name")).data as { id: string; code: string; name: string }[] ?? [],
  });
  const projectById = useMemo(() => new Map((projectsForAdd ?? []).map((p) => [p.id, p])), [projectsForAdd]);

  return (
    <>
      {row.tasks.length === 0 ? (
        <TableRow>
          <TableCell>
            <div className="font-medium">{name}</div>
            {dept && <div className="text-[10px] text-muted-foreground">{dept}</div>}
          </TableCell>
          <TableCell colSpan={4}>
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
        (() => {
          let logCounter = -1;
          return row.tasks.map((t, i) => {
            const isActivity = t.source === "activity";
            if (!isActivity) logCounter++;
            const logIdx = isActivity ? -1 : logCounter;
            const editableRow = mayEdit && !isActivity;
            const primary = t.task_title ?? (isActivity ? "Task" : (t.project_name ?? "—"));
            const hasTaskLabel = !!t.task_title;
            return (
              <TableRow key={`${row.profile.id}-${i}`}>
                {i === 0 && (
                  <TableCell rowSpan={rowspan} className="align-top border-r">
                    <div className="font-medium">{name}</div>
                    {dept && <div className="text-[10px] text-muted-foreground">{dept}</div>}
                    <div className="mt-2 inline-flex items-baseline gap-1 rounded-md bg-muted/60 px-2 py-1 text-sm tabular-nums">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
                      <span className="font-bold">{row.total.toFixed(1)}</span>
                      <span className="text-[10px] text-muted-foreground">h</span>
                    </div>
                  </TableCell>
                )}
                <TableCell>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{primary}</span>
                      {isActivity && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">via task</Badge>}
                      {!isActivity && !hasTaskLabel && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">legacy</Badge>}
                    </div>
                    {(t.project_code || t.project_name) && (
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {t.project_code && <span className="font-mono">{t.project_code}</span>}
                        {t.project_code && t.project_name ? " · " : ""}
                        {t.project_name}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <InlineNumber value={Number(t.hours) || 0} disabled={!editableRow} onCommit={(v) => onUpdate(logIdx, { hours: v })} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <div className="flex-1 min-w-0">
                      <InlineText value={t.comments ?? ""} disabled={!editableRow} onCommit={(v) => onUpdate(logIdx, { comments: v })} placeholder="Optional" />
                    </div>
                    {t.approval_note?.trim() && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" className="text-primary hover:text-primary/80 shrink-0" aria-label="Manager note" title="Manager note">
                            <StickyNote className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 text-sm" align="end">
                          <div className="text-xs font-medium mb-1 text-muted-foreground">Manager note</div>
                          <div className="whitespace-pre-wrap">{t.approval_note}</div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {taskStatusBadge(row, t)}
                  {locked && !isActivity && <div className="text-[10px] text-muted-foreground mt-1">Locked</div>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    {!isActivity && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!editableRow} onClick={() => onDelete(logIdx)} aria-label="Delete row">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {i === 0 && <RowMenu canApprove={canApprove} approved={row.approved} onToggleApproval={onToggleApproval} onOpenFull={onOpenFull} />}
                  </div>
                </TableCell>
              </TableRow>
            );
          });
        })()
      )}
      {mayEdit && row.tasks.length > 0 && addOpen && (
        <TableRow className="bg-muted/20">
          <TableCell>
            <Select value={addTaskId} onValueChange={setAddTaskId}>
              <SelectTrigger className="h-8"><SelectValue placeholder={userTasks && userTasks.length === 0 ? "No tasks assigned" : "Pick task"} /></SelectTrigger>
              <SelectContent className="max-h-72">
                {(userTasks ?? []).map((t) => {
                  const proj = t.project_id ? projectById.get(t.project_id) : null;
                  return (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title ?? "Task"}
                      {proj ? ` — ${proj.code}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </TableCell>
          <TableCell className="text-right">
            <Input type="number" min={0} step={0.25} value={addHrs} onChange={(e) => setAddHrs(e.target.value)} className="h-8 text-right font-mono" placeholder="0" />
          </TableCell>
          <TableCell colSpan={3}>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => {
                const h = Number(addHrs);
                if (!addTaskId || !h || h <= 0) { toast.error("Pick a task and enter hours"); return; }
                const t = (userTasks ?? []).find((x) => x.id === addTaskId);
                if (!t) { toast.error("Task not found"); return; }
                const proj = t.project_id ? projectById.get(t.project_id) : null;
                onAdd({ taskId: t.id, title: t.title ?? "Task", projectCode: proj?.code ?? null, projectName: proj?.name ?? null }, h);
                setAddTaskId(""); setAddHrs(""); setAddOpen(false);
              }}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAddOpen(false); setAddTaskId(""); setAddHrs(""); }}>Cancel</Button>
            </div>
          </TableCell>
        </TableRow>
      )}
      {mayEdit && row.tasks.length > 0 && !addOpen && (
        <TableRow>
          <TableCell colSpan={5}>
            <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add task
            </Button>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}


function taskStatusBadge(row: { approved: boolean }, task?: Task) {
  if (task?.source === "activity") {
    const approved = task.approval_status === "approved" || task.approval_status === "auto";
    if (approved) {
      const partial = task.logged_hours != null && task.approved_hours != null && task.approved_hours < task.logged_hours;
      return (
        <Badge variant="secondary" className="gap-1 text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-300">
          <CheckCircle2 className="h-3 w-3" /> {partial ? `${task.approved_hours}/${task.logged_hours}h` : "Approved"}
        </Badge>
      );
    }
    return <Badge variant="outline">Pending</Badge>;
  }

  return row.approved
    ? <Badge variant="secondary" className="gap-1 text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-300"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>
    : <Badge variant="outline">Pending</Badge>;
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
      className="h-9 text-right text-base font-semibold tabular-nums"
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

function PendingCard({
  id, name, title, projCode, projName, date, logged, note, onDecide,
}: {
  id: string; name: string; title: string;
  projCode: string | null; projName: string | null;
  date: string; logged: number; note: string | null;
  onDecide: (id: string, decide: "approved" | "rejected", reason?: string, approvedHours?: number | null) => void;
}) {
  const [approve, setApprove] = useState<string>(String(logged));
  const [busy, setBusy] = useState(false);
  const approveNum = Number(approve);
  const valid = !Number.isNaN(approveNum) && approveNum >= 0 && approveNum <= logged;
  const reduced = valid && approveNum < logged;

  async function act(decision: "approved" | "rejected") {
    if (decision === "rejected") {
      const reason = window.prompt("Reason for rejection (optional):") ?? undefined;
      setBusy(true);
      try { await onDecide(id, "rejected", reason || undefined); } finally { setBusy(false); }
      return;
    }
    if (!valid) return;
    setBusy(true);
    try { await onDecide(id, "approved", undefined, approveNum); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{name}</div>
          <div className="text-sm truncate mt-0.5">{title}</div>
          {projCode && (
            <div className="text-[11px] text-muted-foreground font-mono truncate">
              {projCode} · {projName}
            </div>
          )}
        </div>
        <Badge variant="outline" className="shrink-0 whitespace-nowrap">
          {format(new Date(date + "T00:00:00"), "d MMM")}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 px-3 py-2.5">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Logged</div>
          <div className="text-2xl font-semibold tabular-nums leading-tight">
            {logged.toFixed(2)}<span className="text-sm font-normal text-muted-foreground ml-0.5">h</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Approve</div>
          <div className="flex items-center gap-1">
            <Input
              type="number" min={0} max={logged} step={0.25}
              value={approve}
              onChange={(e) => setApprove(e.target.value)}
              className={`h-9 w-20 text-right font-mono tabular-nums text-lg ${!valid ? "border-destructive/60" : reduced ? "border-amber-500/60" : ""}`}
            />
            <span className="text-sm text-muted-foreground">h</span>
          </div>
          {reduced && <div className="text-[10px] text-amber-700 mt-0.5">of {logged.toFixed(2)}</div>}
        </div>
      </div>

      {note && (
        <div className="text-xs text-muted-foreground border-l-2 border-border/60 pl-2">{note}</div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
          disabled={busy} onClick={() => act("rejected")}>
          <X className="h-4 w-4 mr-1" /> Reject
        </Button>
        <Button size="sm" disabled={!valid || busy} onClick={() => act("approved")} className="gap-1">
          <Check className="h-4 w-4" /> Approve {valid ? `${approveNum.toFixed(approveNum % 1 === 0 ? 0 : 2)}h` : ""}
        </Button>
      </div>
    </div>
  );
}


