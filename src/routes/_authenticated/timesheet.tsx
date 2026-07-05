import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableProperties, Download } from "lucide-react";
import { MultiSelectFilter, UNASSIGNED } from "@/components/multi-select-filter";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/timesheet")({
  component: TimesheetPage,
});

type Profile = { id: string; full_name: string | null; email: string | null; department: string | null };
type Task = { project_code?: string; project_name?: string; hours?: number; comments?: string };
type LogRow = { user_id: string; date: string; tasks: Task[] | null };

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function TimesheetPage() {
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [deptSel, setDeptSel] = useState<Set<string>>(new Set());
  const [projSel, setProjSel] = useState<Set<string>>(new Set());
  const [drill, setDrill] = useState<{ user: string; code: string; name: string; entries: Array<{ date: string; hours: number; comments?: string }> } | null>(null);

  useEffect(() => {
    if (!meLoading && me && !(me.isAdmin || me.canManageProjects || me.isDepartmentHead)) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [me, meLoading, navigate]);

  const canView = !!me && (me.isAdmin || me.canManageProjects || me.isDepartmentHead);
  const deptScope = !!me && !me.isAdmin && !me.canManageProjects && me.isDepartmentHead ? me.headOfDepartments : null;

  const { data: profiles } = useQuery({
    queryKey: ["ts-profiles", deptScope?.join(",") ?? "all"],
    enabled: canView,
    queryFn: async () => {
      let q = supabase.from("profiles").select("id, full_name, email, department");
      if (deptScope && deptScope.length) q = q.in("department", deptScope);
      return (await q).data as Profile[] ?? [];
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["ts-logs", month],
    enabled: canView,
    queryFn: async () => {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(y, m - 1, 1).toISOString().slice(0, 10);
      const end = new Date(y, m, 1).toISOString().slice(0, 10);
      const { data, error } = await supabase.from("attendance_logs").select("user_id, date, tasks").gte("date", start).lt("date", end);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const profileById = useMemo(() => new Map((profiles ?? []).map((p) => [p.id, p])), [profiles]);

  // Build pivot: user_id -> project_code -> hours, plus daily entries for drill-down
  const pivot = useMemo(() => {
    const cells = new Map<string, Map<string, number>>();
    const drillMap = new Map<string, Array<{ date: string; hours: number; comments?: string }>>();
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
        arr.push({ date: row.date, hours: h, comments: t.comments });
        drillMap.set(k, arr);
      }
    }
    return { cells, drillMap, projMap, userSet };
  }, [logs]);

  const projects = useMemo(() => {
    return Array.from(pivot.projMap.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [pivot.projMap]);

  const users = useMemo(() => {
    return Array.from(pivot.userSet)
      .map((id) => ({ id, profile: profileById.get(id) }))
      .sort((a, b) => (a.profile?.full_name ?? a.profile?.email ?? "").localeCompare(b.profile?.full_name ?? b.profile?.email ?? ""));
  }, [pivot.userSet, profileById]);

  const allDepts = useMemo(() => {
    const s = new Set<string>();
    for (const u of users) if (u.profile?.department) s.add(u.profile.department);
    return Array.from(s).sort();
  }, [users]);

  const filteredUsers = useMemo(() => {
    if (deptSel.size === 0) return users;
    return users.filter((u) => {
      const d = u.profile?.department;
      return d ? deptSel.has(d) : deptSel.has(UNASSIGNED);
    });
  }, [users, deptSel]);

  const filteredProjects = useMemo(() => {
    if (projSel.size === 0) return projects;
    return projects.filter((p) => projSel.has(p.code));
  }, [projects, projSel]);

  const filteredUserIds = useMemo(() => new Set(filteredUsers.map((u) => u.id)), [filteredUsers]);
  const filteredProjCodes = useMemo(() => new Set(filteredProjects.map((p) => p.code)), [filteredProjects]);

  const rowTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of filteredUsers) {
      const uMap = pivot.cells.get(u.id);
      if (!uMap) { m.set(u.id, 0); continue; }
      let s = 0;
      for (const [code, v] of uMap) if (filteredProjCodes.has(code)) s += v;
      m.set(u.id, s);
    }
    return m;
  }, [pivot.cells, filteredUsers, filteredProjCodes]);

  const colTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const uid of filteredUserIds) {
      const uMap = pivot.cells.get(uid);
      if (!uMap) continue;
      for (const [code, v] of uMap) if (filteredProjCodes.has(code)) m.set(code, (m.get(code) ?? 0) + v);
    }
    return m;
  }, [pivot.cells, filteredUserIds, filteredProjCodes]);

  const grandTotal = useMemo(() => {
    let s = 0;
    for (const v of rowTotals.values()) s += v;
    return s;
  }, [rowTotals]);

  function exportCsv() {
    const header = ["Employee", "Email", ...filteredProjects.map((p) => `${p.code} ${p.name}`), "Total"];
    const rows = filteredUsers.map((u) => {
      const name = u.profile?.full_name ?? u.profile?.email ?? u.id;
      const email = u.profile?.email ?? "";
      const uMap = pivot.cells.get(u.id) ?? new Map();
      const cells = filteredProjects.map((p) => {
        const v = uMap.get(p.code) ?? 0;
        return v > 0 ? String(v) : "";
      });
      return [name, email, ...cells, String(rowTotals.get(u.id) ?? 0)];
    });
    const totalRow = ["Total", "", ...filteredProjects.map((p) => String(colTotals.get(p.code) ?? 0)), String(grandTotal)];
    const csv = [header, ...rows, totalRow]
      .map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-${month}.csv`;
    a.click();
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
          <p className="text-sm text-muted-foreground">Hours logged by each employee against each project.</p>
        </div>
        <div className="flex items-end gap-2">
          {(() => {
            const [yr, mo] = month.split("-");
            const now = new Date();
            const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
            const months = [
              ["01", "January"], ["02", "February"], ["03", "March"], ["04", "April"],
              ["05", "May"], ["06", "June"], ["07", "July"], ["08", "August"],
              ["09", "September"], ["10", "October"], ["11", "November"], ["12", "December"],
            ] as const;
            return (
              <>
                <Select value={mo} onValueChange={(v) => setMonth(`${yr}-${v}`)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {months.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={yr} onValueChange={(v) => setMonth(`${v}-${mo}`)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            );
          })()}
          <MultiSelectFilter
            label="Department"
            options={allDepts.map((d) => ({ value: d, label: d }))}
            selected={deptSel}
            onChange={setDeptSel}
            includeUnassigned
          />
          <MultiSelectFilter
            label="Projects"
            options={projects.map((p) => ({ value: p.code, label: p.name, sub: p.code }))}
            selected={projSel}
            onChange={setProjSel}
          />
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filteredUsers.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Employee × Project — {month}</CardTitle>
          <CardDescription>
            {filteredUsers.length} employee{filteredUsers.length === 1 ? "" : "s"} · {filteredProjects.length} project{filteredProjects.length === 1 ? "" : "s"} · {grandTotal.toFixed(1)} total hrs
            {" · "}Click a cell for the day-by-day breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 text-center">No hours logged in {month} for the selected filters.</div>
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
                                  type="button"
                                  className="text-sm hover:underline"
                                  onClick={() => setDrill({
                                    user: name,
                                    code: p.code,
                                    name: p.name,
                                    entries: (pivot.drillMap.get(`${u.id}::${p.code}`) ?? []).sort((a, b) => a.date.localeCompare(b.date)),
                                  })}
                                >
                                  {v}
                                </button>
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
                    {filteredProjects.map((p) => (
                      <TableCell key={p.code} className="text-right font-semibold">{(colTotals.get(p.code) ?? 0).toFixed(1)}</TableCell>
                    ))}
                    <TableCell className="text-right sticky right-0 bg-card z-10 font-bold">{grandTotal.toFixed(1)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <SheetContent className="w-full sm:max-w-md">
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
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead>Comments</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drill.entries.map((e, i) => (
                      <TableRow key={`${e.date}-${i}`}>
                        <TableCell className="text-xs">{format(new Date(e.date), "d MMM")}</TableCell>
                        <TableCell className="text-right">{e.hours}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.comments ?? ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
