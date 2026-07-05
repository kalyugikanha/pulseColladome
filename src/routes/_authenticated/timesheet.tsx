import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TableProperties, Download, CalendarIcon, Pencil, CheckCircle2 } from "lucide-react";
import { MultiSelectFilter, UNASSIGNED } from "@/components/multi-select-filter";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { DayEditorSheet } from "@/components/day-editor-sheet";
import { useVisibilityScope } from "@/hooks/use-visibility-scope";

export const Route = createFileRoute("/_authenticated/timesheet")({
  component: TimesheetPage,
});

type Profile = { id: string; full_name: string | null; email: string | null; department: string | null };
type Task = { project_code?: string; project_name?: string; hours?: number; comments?: string };
type LogRow = { id: string; user_id: string; date: string; tasks: Task[] | null; approved_at: string | null };

type ViewMode = "month" | "range" | "day";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // Monday start
  x.setDate(x.getDate() - diff);
  return x;
}

function TimesheetPage() {
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const navigate = useNavigate();

  const [view, setView] = useState<ViewMode>("month");
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [rangeFrom, setRangeFrom] = useState<Date>(() => startOfWeek(new Date()));
  const [rangeTo, setRangeTo] = useState<Date>(() => new Date());
  const [day, setDay] = useState<Date>(() => new Date());

  const [deptSel, setDeptSel] = useState<Set<string>>(new Set());
  const [projSel, setProjSel] = useState<Set<string>>(new Set());
  const [empSel, setEmpSel] = useState<Set<string>>(new Set());
  const [drill, setDrill] = useState<{ userId: string; user: string; code: string; name: string; entries: Array<{ date: string; hours: number; comments?: string; approved: boolean }> } | null>(null);
  const [editor, setEditor] = useState<{ userId: string; userName: string; date: string } | null>(null);

  useEffect(() => {
    if (!meLoading && me && !(me.isAdmin || me.canManageProjects || me.isDepartmentHead || me.isReportingManager)) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [me, meLoading, navigate]);

  const canView = !!me && (me.isAdmin || me.canManageProjects || me.isDepartmentHead || me.isReportingManager);
  const canEdit = !!me && (me.isSuperAdmin || me.canManageProjects || me.isDepartmentHead || me.isReportingManager);
  const canApprove = canEdit;
  const { deptScope, userScope } = useVisibilityScope(me);

  // Compute active date range based on view.
  const { startIso, endIso, label } = useMemo(() => {
    if (view === "month") {
      const [y, m] = month.split("-").map(Number);
      const s = new Date(y, m - 1, 1);
      const e = new Date(y, m, 1);
      return { startIso: ymd(s), endIso: ymd(e), label: month };
    }
    if (view === "range") {
      const s = rangeFrom;
      const e = new Date(rangeTo); e.setDate(e.getDate() + 1);
      return { startIso: ymd(s), endIso: ymd(e), label: `${format(s, "d MMM")} – ${format(rangeTo, "d MMM yyyy")}` };
    }
    const e = new Date(day); e.setDate(e.getDate() + 1);
    return { startIso: ymd(day), endIso: ymd(e), label: format(day, "EEEE, d MMM yyyy") };
  }, [view, month, rangeFrom, rangeTo, day]);

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
  const visibleUserIdSet = useMemo(() => new Set(visibleUserIds), [visibleUserIds]);
  const hasScope = !!deptScope || !!userScope;

  const { data: logs } = useQuery({
    queryKey: ["ts-logs", startIso, endIso, hasScope ? visibleUserIds.join(",") : "all"],
    enabled: canView && (!hasScope || visibleUserIds.length > 0),
    queryFn: async () => {
      let q = supabase
        .from("attendance_logs")
        .select("id, user_id, date, tasks, approved_at")
        .gte("date", startIso).lt("date", endIso);
      if (hasScope) q = q.in("user_id", visibleUserIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });


  const profileById = useMemo(() => new Map((profiles ?? []).map((p) => [p.id, p])), [profiles]);
  const approvedByDay = useMemo(() => {
    const s = new Set<string>();
    for (const r of logs ?? []) if (r.approved_at) s.add(`${r.user_id}::${r.date}`);
    return s;
  }, [logs]);

  // Pivot: user_id -> project_code -> hours, plus drill entries.
  const pivot = useMemo(() => {
    const cells = new Map<string, Map<string, number>>();
    const drillMap = new Map<string, Array<{ date: string; hours: number; comments?: string; approved: boolean }>>();
    const projMap = new Map<string, string>();
    const userSet = new Set<string>();
    for (const row of logs ?? []) {
      userSet.add(row.user_id);
      for (const t of row.tasks ?? []) {
        const code = t.project_code?.trim();
        const h = Number(t.hours) || 0;
        if (!code || h <= 0) continue;
        if (!projMap.has(code)) projMap.set(code, t.project_name || code);
        const uMap = cells.get(row.user_id) ?? new Map<string, number>();
        uMap.set(code, (uMap.get(code) ?? 0) + h);
        cells.set(row.user_id, uMap);
        const k = `${row.user_id}::${code}`;
        const arr = drillMap.get(k) ?? [];
        arr.push({ date: row.date, hours: h, comments: t.comments, approved: !!row.approved_at });
        drillMap.set(k, arr);
      }
    }
    return { cells, drillMap, projMap, userSet };
  }, [logs]);

  const projects = useMemo(() => Array.from(pivot.projMap.entries()).map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code)), [pivot.projMap]);
  const users = useMemo(() => Array.from(pivot.userSet).map((id) => ({ id, profile: profileById.get(id) })).sort((a, b) => (a.profile?.full_name ?? a.profile?.email ?? "").localeCompare(b.profile?.full_name ?? b.profile?.email ?? "")), [pivot.userSet, profileById]);
  const allDepts = useMemo(() => { const s = new Set<string>(); for (const u of users) if (u.profile?.department) s.add(u.profile.department); return Array.from(s).sort(); }, [users]);
  const filteredUsers = useMemo(() => deptSel.size === 0 ? users : users.filter((u) => { const d = u.profile?.department; return d ? deptSel.has(d) : deptSel.has(UNASSIGNED); }), [users, deptSel]);
  const filteredProjects = useMemo(() => projSel.size === 0 ? projects : projects.filter((p) => projSel.has(p.code)), [projects, projSel]);
  const filteredUserIds = useMemo(() => new Set(filteredUsers.map((u) => u.id)), [filteredUsers]);
  const filteredProjCodes = useMemo(() => new Set(filteredProjects.map((p) => p.code)), [filteredProjects]);

  const rowTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of filteredUsers) {
      const uMap = pivot.cells.get(u.id);
      if (!uMap) { m.set(u.id, 0); continue; }
      let s = 0; for (const [code, v] of uMap) if (filteredProjCodes.has(code)) s += v;
      m.set(u.id, s);
    }
    return m;
  }, [pivot.cells, filteredUsers, filteredProjCodes]);
  const colTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const uid of filteredUserIds) { const uMap = pivot.cells.get(uid); if (!uMap) continue; for (const [code, v] of uMap) if (filteredProjCodes.has(code)) m.set(code, (m.get(code) ?? 0) + v); }
    return m;
  }, [pivot.cells, filteredUserIds, filteredProjCodes]);
  const grandTotal = useMemo(() => { let s = 0; for (const v of rowTotals.values()) s += v; return s; }, [rowTotals]);

  // Day view rows: one row per (user, date, project) with approved flag.
  const dayViewRows = useMemo(() => {
    if (view !== "day") return [];
    const out: Array<{ userId: string; userName: string; date: string; code: string; name: string; hours: number; comments?: string; approved: boolean }> = [];
    for (const row of logs ?? []) {
      if (!filteredUserIds.has(row.user_id)) continue;
      const uName = profileById.get(row.user_id)?.full_name ?? profileById.get(row.user_id)?.email ?? "—";
      for (const t of row.tasks ?? []) {
        const code = t.project_code?.trim(); const h = Number(t.hours) || 0;
        if (!code || h <= 0) continue;
        if (filteredProjCodes.size && !filteredProjCodes.has(code)) continue;
        out.push({ userId: row.user_id, userName: uName, date: row.date, code, name: t.project_name || code, hours: h, comments: t.comments, approved: !!row.approved_at });
      }
    }
    return out.sort((a, b) => a.userName.localeCompare(b.userName));
  }, [view, logs, filteredUserIds, filteredProjCodes, profileById]);

  function exportCsv() {
    const header = ["Employee", "Email", ...filteredProjects.map((p) => `${p.code} ${p.name}`), "Total"];
    const rows = filteredUsers.map((u) => {
      const name = u.profile?.full_name ?? u.profile?.email ?? u.id;
      const email = u.profile?.email ?? "";
      const uMap = pivot.cells.get(u.id) ?? new Map();
      const cells = filteredProjects.map((p) => { const v = uMap.get(p.code) ?? 0; return v > 0 ? String(v) : ""; });
      return [name, email, ...cells, String(rowTotals.get(u.id) ?? 0)];
    });
    const totalRow = ["Total", "", ...filteredProjects.map((p) => String(colTotals.get(p.code) ?? 0)), String(grandTotal)];
    const csv = [header, ...rows, totalRow].map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `timesheet-${label}.csv`; a.click();
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
          <p className="text-sm text-muted-foreground">Hours logged by each employee. Click any cell or row to view and edit daily entries.</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <Select value={view} onValueChange={(v: ViewMode) => setView(v)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="range">Range</SelectItem>
              <SelectItem value="day">Day</SelectItem>
            </SelectContent>
          </Select>

          {view === "month" && (() => {
            const [yr, mo] = month.split("-");
            const now = new Date();
            const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
            const months = [["01", "January"], ["02", "February"], ["03", "March"], ["04", "April"], ["05", "May"], ["06", "June"], ["07", "July"], ["08", "August"], ["09", "September"], ["10", "October"], ["11", "November"], ["12", "December"]] as const;
            return (
              <>
                <Select value={mo} onValueChange={(v) => setMonth(`${yr}-${v}`)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{months.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={yr} onValueChange={(v) => setMonth(`${v}-${mo}`)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </>
            );
          })()}

          {view === "range" && (
            <>
              <DatePickerButton value={rangeFrom} onChange={setRangeFrom} label="From" />
              <DatePickerButton value={rangeTo} onChange={setRangeTo} label="To" />
            </>
          )}
          {view === "day" && <DatePickerButton value={day} onChange={setDay} label="Day" />}

          <MultiSelectFilter label="Department" options={allDepts.map((d) => ({ value: d, label: d }))} selected={deptSel} onChange={setDeptSel} includeUnassigned />
          <MultiSelectFilter label="Projects" options={projects.map((p) => ({ value: p.code, label: p.name, sub: p.code }))} selected={projSel} onChange={setProjSel} />
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filteredUsers.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </header>

      {view !== "day" ? (
        <Card>
          <CardHeader>
            <CardTitle>Employee × Project — {label}</CardTitle>
            <CardDescription>
              {filteredUsers.length} employee{filteredUsers.length === 1 ? "" : "s"} · {filteredProjects.length} project{filteredProjects.length === 1 ? "" : "s"} · {grandTotal.toFixed(1)} total hrs · Click a cell to view daily breakdown.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredUsers.length === 0 ? (
              <div className="text-sm text-muted-foreground py-10 text-center">No hours logged in this period.</div>
            ) : (
              <div className="overflow-auto max-h-[70vh] border rounded-md">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead className="sticky left-0 bg-card z-20 min-w-[200px]">Employee</TableHead>
                      {filteredProjects.map((p) => (
                        <TableHead key={p.code} className="text-right whitespace-nowrap">
                          <div className="font-mono text-[10px] text-muted-foreground">{p.code}</div>
                          <div className="text-xs">{p.name}</div>
                        </TableHead>
                      ))}
                      <TableHead className="text-right sticky right-0 bg-card z-20 font-semibold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => {
                      const uMap = pivot.cells.get(u.id) ?? new Map<string, number>();
                      const name = u.profile?.full_name ?? u.profile?.email ?? "—";
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="sticky left-0 bg-card z-10">
                            <div className="font-medium">{name}</div>
                            {u.profile?.department && <div className="text-[10px] text-muted-foreground">{u.profile.department}</div>}
                          </TableCell>
                          {filteredProjects.map((p) => {
                            const v = uMap.get(p.code) ?? 0;
                            return (
                              <TableCell key={p.code} className="text-right">
                                {v > 0 ? (
                                  <button
                                    type="button" className="text-sm hover:underline"
                                    onClick={() => setDrill({
                                      userId: u.id, user: name, code: p.code, name: p.name,
                                      entries: (pivot.drillMap.get(`${u.id}::${p.code}`) ?? []).sort((a, b) => a.date.localeCompare(b.date)),
                                    })}
                                  >{v}</button>
                                ) : (
                                  <span className="text-muted-foreground/40">·</span>
                                )}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-right sticky right-0 bg-card z-10 font-semibold">{(rowTotals.get(u.id) ?? 0).toFixed(1)}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="border-t-2">
                      <TableCell className="sticky left-0 bg-card z-10 font-semibold">Total</TableCell>
                      {filteredProjects.map((p) => <TableCell key={p.code} className="text-right font-semibold">{(colTotals.get(p.code) ?? 0).toFixed(1)}</TableCell>)}
                      <TableCell className="text-right sticky right-0 bg-card z-10 font-bold">{grandTotal.toFixed(1)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{label}</CardTitle>
            <CardDescription>{dayViewRows.length} entries · {dayViewRows.reduce((s, r) => s + r.hours, 0).toFixed(1)} total hrs</CardDescription>
          </CardHeader>
          <CardContent>
            {dayViewRows.length === 0 ? (
              <div className="text-sm text-muted-foreground py-10 text-center">No entries for this day.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead><TableHead>Project</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead>Comments</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dayViewRows.map((r, i) => (
                    <TableRow key={`${r.userId}-${r.code}-${i}`}>
                      <TableCell className="font-medium">{r.userName}</TableCell>
                      <TableCell><span className="font-mono text-xs mr-2 text-muted-foreground">{r.code}</span>{r.name}</TableCell>
                      <TableCell className="text-right font-mono">{r.hours.toFixed(1)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.comments ?? ""}</TableCell>
                      <TableCell>
                        {r.approved
                          ? <Badge variant="secondary" className="gap-1 text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-300"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>
                          : <Badge variant="outline">Pending</Badge>}
                      </TableCell>
                      <TableCell>
                        {canEdit && (
                          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditor({ userId: r.userId, userName: r.userName, date: r.date })}>
                            <Pencil className="h-3 w-3 mr-1" /> Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Sheet open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {drill && (
            <>
              <SheetHeader>
                <SheetTitle>{drill.user}</SheetTitle>
                <SheetDescription>
                  <span className="font-mono text-xs mr-2">{drill.code}</span>{drill.name} — {drill.entries.reduce((s, e) => s + e.hours, 0).toFixed(1)} hrs
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead className="text-right">Hours</TableHead>
                    <TableHead>Comments</TableHead><TableHead>Status</TableHead><TableHead />
                  </TableRow></TableHeader>
                  <TableBody>
                    {drill.entries.map((e, i) => (
                      <TableRow key={`${e.date}-${i}`}>
                        <TableCell className="text-xs">{format(new Date(e.date + "T00:00:00"), "d MMM")}</TableCell>
                        <TableCell className="text-right">{e.hours}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.comments ?? ""}</TableCell>
                        <TableCell>
                          {e.approved
                            ? <Badge variant="secondary" className="text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-300"><CheckCircle2 className="h-3 w-3" /></Badge>
                            : <Badge variant="outline">·</Badge>}
                        </TableCell>
                        <TableCell>
                          {canEdit && (
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditor({ userId: drill.userId, userName: drill.user, date: e.date }); setDrill(null); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {editor && (
        <DayEditorSheet
          open={!!editor}
          onOpenChange={(o) => !o && setEditor(null)}
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

function DatePickerButton({ value, onChange, label }: { value: Date; onChange: (d: Date) => void; label: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <CalendarIcon className="h-4 w-4 mr-2" />
          <span className="text-xs text-muted-foreground mr-1">{label}:</span>
          {format(value, "d MMM yyyy")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar mode="single" selected={value} onSelect={(d) => d && onChange(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}
