import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flame, IndianRupee, TrendingUp, CalendarDays } from "lucide-react";
import { format, getDaysInMonth } from "date-fns";
import { MultiSelectFilter, UNASSIGNED } from "@/components/multi-select-filter";
import { useVisibilityScope } from "@/hooks/use-visibility-scope";

export const Route = createFileRoute("/_authenticated/project-burn")({
  component: ProjectBurnPage,
});

type Salary = { user_id: string; monthly_salary: number; effective_from: string };
type LogRow = { user_id: string; date: string; tasks: Array<{ project_code?: string; project_name?: string; hours?: number }> | null };
type Profile = { id: string; full_name: string | null; email: string | null; department: string | null };

function monthKey(d: Date) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }
const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function ProjectBurnPage() {
  const { data: me, isLoading } = useCurrentUser();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [deptSel, setDeptSel] = useState<Set<string>>(new Set());
  const [empSel, setEmpSel] = useState<Set<string>>(new Set());

  const canView = !!me && (me.isFinanceAdmin || me.isDepartmentHead || me.isReportingManager);
  const showCosts = !!me?.isFinanceAdmin;
  const { deptScope, userScope } = useVisibilityScope(me);

  const { data: profiles } = useQuery({
    queryKey: ["pb-profiles", deptScope?.join(",") ?? "all", userScope?.join(",") ?? "all"],
    enabled: canView,
    queryFn: async () => {
      let q = supabase.from("profiles").select("id, full_name, email, department");
      if (deptScope && deptScope.length) q = q.in("department", deptScope);
      if (userScope && userScope.length) q = q.in("id", userScope);
      return (await q).data as Profile[] ?? [];
    },
  });

  const { data: grants } = useQuery({
    queryKey: ["pb-grants"],
    enabled: canView && showCosts,
    queryFn: async () => (await supabase.from("role_grants").select("email, default_monthly_salary")).data as Array<{ email: string; default_monthly_salary: number | null }> ?? [],
  });

  const { data: salaries } = useQuery({
    queryKey: ["pb-salaries"],
    enabled: canView && showCosts,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("salaries").select("user_id, monthly_salary, effective_from").order("effective_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Salary[];
    },
  });

  const { data: unpaidLeaves } = useQuery({
    queryKey: ["pb-unpaid-leaves", month],
    enabled: canView && showCosts,
    queryFn: async () => {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("leave_requests")
        .select("user_id, start_date, end_date, leave_type, status")
        .eq("leave_type", "unpaid")
        .eq("status", "approved")
        .lte("start_date", end)
        .gte("end_date", start);
      if (error) throw error;
      return (data ?? []) as Array<{ user_id: string; start_date: string; end_date: string }>;
    },
  });


  const visibleUserIds = useMemo(() => (profiles ?? []).map((p) => p.id), [profiles]);
  const hasScope = !!deptScope || !!userScope;

  const { data: logs } = useQuery({
    queryKey: ["pb-logs", month, hasScope ? visibleUserIds.join(",") : "all"],
    enabled: canView && (!hasScope || visibleUserIds.length > 0),
    queryFn: async () => {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      let q = supabase.from("attendance_logs").select("user_id, date, tasks").gte("date", start).lt("date", end).order("date");
      if (hasScope) q = q.in("user_id", visibleUserIds);
      return (await q).data as LogRow[] ?? [];
    },
  });

  // Approved task_activity hours in this month, attributed to actor + linked project.
  const { data: activityLogs } = useQuery({
    queryKey: ["pb-activity", month, hasScope ? visibleUserIds.join(",") : "all"],
    enabled: canView && (!hasScope || visibleUserIds.length > 0),
    queryFn: async () => {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      let q = supabase
        .from("task_activity" as never)
        .select("actor_id, hours, approved_hours, completion_date, created_at, approval_status, task:tasks(project:projects(code, name))")
        .eq("approval_status", "approved")
        .not("hours", "is", null)
        .gte("completion_date", start)
        .lt("completion_date", end);
      if (hasScope) q = q.in("actor_id", visibleUserIds);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as Array<{
        actor_id: string; hours: number | null; approved_hours: number | null;
        completion_date: string | null; created_at: string;
        task: { project: { code: string | null; name: string | null } | null } | null;
      }>);
    },
  });

  // Combine attendance-log entries with approved task_activity, reshaped into LogRow form.
  const combinedLogs = useMemo<LogRow[]>(() => {
    const base = (logs ?? []).slice();
    for (const a of activityLogs ?? []) {
      const h = Number(a.approved_hours ?? a.hours) || 0;
      if (h <= 0) continue;
      const code = a.task?.project?.code?.trim();
      if (!code) continue; // no project = can't attribute to a project's burn
      const date = a.completion_date ?? a.created_at.slice(0, 10);
      base.push({
        user_id: a.actor_id,
        date,
        tasks: [{ project_code: code, project_name: a.task?.project?.name ?? code, hours: h }],
      });
    }

    return base;
  }, [logs, activityLogs]);



  // Latest effective raw monthly salary per user as of selected month.
  const rawSalaryByUser = useMemo(() => {
    const map = new Map<string, { monthly_salary: number; effective_from: string }>();
    if (!salaries) return map;
    const [y, m] = month.split("-").map(Number);
    const cutoff = new Date(Date.UTC(y, m, 0));
    for (const s of salaries) {
      if (new Date(s.effective_from) > cutoff) continue;
      if (!map.has(s.user_id)) map.set(s.user_id, { monthly_salary: Number(s.monthly_salary), effective_from: s.effective_from });
    }
    return map;
  }, [salaries, month]);

  // Approved unpaid leave days per user overlapping the selected month.
  const unpaidDaysByUser = useMemo(() => {
    const map = new Map<string, number>();
    if (!unpaidLeaves) return map;
    const [y, m] = month.split("-").map(Number);
    const mStart = Date.UTC(y, m - 1, 1);
    const mEnd = Date.UTC(y, m, 0);
    const DAY = 86400000;
    for (const lr of unpaidLeaves) {
      const s = Date.parse(lr.start_date);
      const e = Date.parse(lr.end_date);
      if (isNaN(s) || isNaN(e)) continue;
      const from = Math.max(s, mStart);
      const to = Math.min(e, mEnd);
      if (to < from) continue;
      const days = Math.round((to - from) / DAY) + 1;
      map.set(lr.user_id, (map.get(lr.user_id) ?? 0) + days);
    }
    return map;
  }, [unpaidLeaves, month]);

  // Pro-rated actual monthly salary per user (matches /finances).
  const salaryByUser = useMemo(() => {
    const map = new Map<string, number>();
    const [y, m] = month.split("-").map(Number);
    const daysInMo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthStart = new Date(Date.UTC(y, m - 1, 1));
    for (const [uid, s] of rawSalaryByUser) {
      const eff = new Date(s.effective_from);
      const startDay = eff > monthStart ? eff.getUTCDate() : 1;
      const effectiveDays = daysInMo - startDay + 1;
      const payableDays = Math.max(0, effectiveDays - (unpaidDaysByUser.get(uid) ?? 0));
      if (payableDays <= 0) continue;
      const contrib = s.monthly_salary * payableDays / daysInMo;
      if (contrib > 0) map.set(uid, contrib);
    }
    return map;
  }, [rawSalaryByUser, unpaidDaysByUser, month]);


  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles ?? []) m.set(p.id, p.full_name || p.email || "—");
    return m;
  }, [profiles]);

  const deptById = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const p of profiles ?? []) m.set(p.id, p.department);
    return m;
  }, [profiles]);

  const allDepts = useMemo(() => {
    const s = new Set<string>();
    for (const p of profiles ?? []) if (p.department) s.add(p.department);
    return Array.from(s).sort();
  }, [profiles]);

  function passesDept(userId: string): boolean {
    if (deptSel.size === 0) return true;
    const d = deptById.get(userId) ?? null;
    return d ? deptSel.has(d) : deptSel.has(UNASSIGNED);
  }

  // Monthly totals: per-user, sum hours per project (for salary-share)
  const monthlyUserTotals = useMemo(() => {
    const totals = new Map<string, number>(); // user_id -> monthly total hours
    for (const row of combinedLogs) {
      for (const t of row.tasks ?? []) {
        const h = Number(t.hours) || 0;
        if (h <= 0) continue;
        totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + h);
      }
    }
    return totals;
  }, [combinedLogs]);

  // Restrict logs to profiles in scope (dept-head only sees her team).
  const profileIdSet = useMemo(() => new Set((profiles ?? []).map((p) => p.id)), [profiles]);
  const scopedLogs = useMemo(() => combinedLogs.filter((r) => profileIdSet.size === 0 || profileIdSet.has(r.user_id)), [combinedLogs, profileIdSet]);

  // Daily rows: [date, project_code, user_id, hours, burn]
  type DailyRow = { date: string; code: string; name: string; user_id: string; hours: number; burn: number };
  const dailyRows: DailyRow[] = useMemo(() => {
    const out: DailyRow[] = [];
    for (const row of scopedLogs) {
      const monthlyHrs = monthlyUserTotals.get(row.user_id) ?? 0;
      const salary = salaryByUser.get(row.user_id) ?? 0;
      for (const t of row.tasks ?? []) {
        const code = t.project_code?.trim();
        const h = Number(t.hours) || 0;
        if (!code || h <= 0) continue;
        const burn = monthlyHrs > 0 ? (h / monthlyHrs) * salary : 0;
        out.push({ date: row.date, code, name: t.project_name || code, user_id: row.user_id, hours: h, burn });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [scopedLogs, monthlyUserTotals, salaryByUser]);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of dailyRows) if (!map.has(r.code)) map.set(r.code, r.name);
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [dailyRows]);

  const deptFilteredDaily = useMemo(() => dailyRows.filter((r) => passesDept(r.user_id) && (empSel.size === 0 || empSel.has(r.user_id))), [dailyRows, deptSel, deptById, empSel]);
  const filteredDaily = useMemo(() => projectFilter === "all" ? deptFilteredDaily : deptFilteredDaily.filter((r) => r.code === projectFilter), [deptFilteredDaily, projectFilter]);


  // Reset project filter if the chosen project no longer exists in the visible month.
  useEffect(() => {
    if (projectFilter !== "all" && !dailyRows.some((r) => r.code === projectFilter)) {
      setProjectFilter("all");
    }
  }, [projectFilter, dailyRows]);

  const totalBurn = useMemo(() => filteredDaily.reduce((s, r) => s + r.burn, 0), [filteredDaily]);
  const totalHours = useMemo(() => filteredDaily.reduce((s, r) => s + r.hours, 0), [filteredDaily]);
  const activeProjectCount = useMemo(() => new Set(filteredDaily.map((r) => r.code)).size, [filteredDaily]);
  // Pool includes signed-up salaries + pending grants (people who will get that salary once they sign up)
  const totalSalaryPool = useMemo(() => {
    const signedUp = Array.from(salaryByUser.values()).reduce((s, v) => s + v, 0);
    const profileEmails = new Set((profiles ?? []).map((p) => p.email?.toLowerCase()).filter(Boolean) as string[]);
    const pending = (grants ?? []).filter((g) => !profileEmails.has(g.email.toLowerCase())).reduce((s, g) => s + Number(g.default_monthly_salary ?? 0), 0);
    return signedUp + pending;
  }, [salaryByUser, profiles, grants]);
  const pendingCount = useMemo(() => {
    const profileEmails = new Set((profiles ?? []).map((p) => p.email?.toLowerCase()).filter(Boolean) as string[]);
    return (grants ?? []).filter((g) => !profileEmails.has(g.email.toLowerCase())).length;
  }, [profiles, grants]);

  const daysInMonth = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return getDaysInMonth(new Date(y, m - 1, 1));
  }, [month]);

  // Employees present in the filtered view, sorted by total metric desc for stable colors + legend order.
  const employeeSeries = useMemo(() => {
    const map = new Map<string, { userId: string; name: string; hours: number; burn: number }>();
    for (const r of filteredDaily) {
      const cur = map.get(r.user_id) ?? { userId: r.user_id, name: nameById.get(r.user_id) ?? "—", hours: 0, burn: 0 };
      cur.hours += r.hours; cur.burn += r.burn;
      map.set(r.user_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => (showCosts ? b.burn - a.burn : b.hours - a.hours));
  }, [filteredDaily, nameById, showCosts]);

  const EMP_COLORS = [
    "hsl(217 91% 60%)", "hsl(160 84% 39%)", "hsl(38 92% 50%)", "hsl(0 84% 60%)",
    "hsl(280 87% 65%)", "hsl(190 90% 45%)", "hsl(340 82% 60%)", "hsl(120 60% 45%)",
    "hsl(20 90% 55%)", "hsl(260 70% 60%)", "hsl(180 70% 40%)", "hsl(50 90% 50%)",
  ];
  const colorFor = (userId: string) => {
    const idx = employeeSeries.findIndex((e) => e.userId === userId);
    return EMP_COLORS[(idx < 0 ? 0 : idx) % EMP_COLORS.length];
  };

  // Daily stacked series: per-day per-user hours + burn.
  const dailyTrend = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const arr = Array.from({ length: daysInMonth }, (_, i) => {
      const d = `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
      return { date: d, total: 0, perUser: new Map<string, { hours: number; burn: number }>() };
    });
    for (const r of filteredDaily) {
      const idx = Number(r.date.slice(8, 10)) - 1;
      if (!arr[idx]) continue;
      const cell = arr[idx];
      const cur = cell.perUser.get(r.user_id) ?? { hours: 0, burn: 0 };
      cur.hours += r.hours; cur.burn += r.burn;
      cell.perUser.set(r.user_id, cur);
      cell.total += showCosts ? r.burn : r.hours;
    }
    return arr;
  }, [filteredDaily, month, daysInMonth, showCosts]);
  const trendMax = Math.max(1, ...dailyTrend.map((d) => d.total));

  // Burn by project rollup (respects month/dept/employee/project filters).
  const projectRollup = useMemo(() => {
    const map = new Map<string, { code: string; name: string; hours: number; burn: number; contributors: Set<string> }>();
    for (const r of filteredDaily) {
      const cur = map.get(r.code) ?? { code: r.code, name: r.name, hours: 0, burn: 0, contributors: new Set<string>() };
      cur.hours += r.hours;
      cur.burn += r.burn;
      cur.contributors.add(r.user_id);
      map.set(r.code, cur);
    }
    return Array.from(map.values())
      .map((v) => ({ code: v.code, name: v.name, hours: v.hours, burn: v.burn, contributors: v.contributors.size }))
      .sort((a, b) => (showCosts ? b.burn - a.burn : b.hours - a.hours));
  }, [filteredDaily, showCosts]);


  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!canView) throw redirect({ to: "/dashboard" });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2"><Flame className="h-6 w-6 text-primary" /> Project Burn</h1>
          <p className="text-sm text-muted-foreground">{showCosts ? "Daily burn allocated from salaries as team logs hours. Salary-share allocation." : `Project hours by teammate — ${(me?.headOfDepartments ?? []).join(", ") || (me?.isReportingManager ? "your direct reports" : "your team")}.`}</p>

        </div>
        <div className="flex items-center gap-2">
          {(() => {
            const [yr, mo] = month.split("-");
            const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
            const months = [
              ["01", "January"], ["02", "February"], ["03", "March"], ["04", "April"],
              ["05", "May"], ["06", "June"], ["07", "July"], ["08", "August"],
              ["09", "September"], ["10", "October"], ["11", "November"], ["12", "December"],
            ] as const;
            return (
              <>
                <Select value={mo} onValueChange={(v) => setMonth(`${yr}-${v}`)}>
                  <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {months.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={yr} onValueChange={(v) => setMonth(`${v}-${mo}`)}>
                  <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
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
            label="Employee"
            options={(profiles ?? []).map((p) => ({ value: p.id, label: p.full_name ?? p.email ?? "—", sub: p.email ?? undefined }))}
            selected={empSel}
            onChange={setEmpSel}
          />
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-52 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        {showCosts && <Stat icon={<IndianRupee className="h-4 w-4" />} label="Burned this month" value={inr(totalBurn)} sub={`${totalHours.toFixed(1)} hrs`} />}
        {showCosts && <Stat icon={<TrendingUp className="h-4 w-4" />} label="Salary pool" value={inr(totalSalaryPool)} sub={`${salaryByUser.size} active${pendingCount ? ` · ${pendingCount} pending` : ""}`} />}
        {showCosts && <Stat icon={<Flame className="h-4 w-4" />} label="Coverage" value={totalSalaryPool > 0 ? `${((totalBurn / totalSalaryPool) * 100).toFixed(0)}%` : "—"} sub="of salary pool allocated" />}
        {!showCosts && <Stat icon={<CalendarDays className="h-4 w-4" />} label="Hours this month" value={totalHours.toFixed(1)} sub={`${(profiles ?? []).length} teammates`} />}
        <Stat icon={<CalendarDays className="h-4 w-4" />} label="Active projects" value={String(activeProjectCount)} sub="with logged hours" />
      </div>


      <Card>
        <CardHeader>
          <CardTitle>{showCosts ? `Daily burn — ${month}` : `Daily hours — ${month}`}</CardTitle>
          <CardDescription>{projectFilter === "all" ? "All projects" : projects.find((p) => p.code === projectFilter)?.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-1 h-40">
            {dailyTrend.map((d) => {
              const totalPct = (d.total / trendMax) * 100;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${totalPct}%`, minHeight: d.total > 0 ? 2 : 0 }}>
                    {employeeSeries.map((emp) => {
                      const cell = d.perUser.get(emp.userId);
                      if (!cell) return null;
                      const val = showCosts ? cell.burn : cell.hours;
                      if (val <= 0) return null;
                      const segPct = d.total > 0 ? (val / d.total) * 100 : 0;
                      return (
                        <div
                          key={emp.userId}
                          style={{ height: `${segPct}%`, background: colorFor(emp.userId) }}
                          title={`${emp.name} — ${d.date}: ${cell.hours.toFixed(1)}h${showCosts ? ` · ${inr(cell.burn)}` : ""}`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[9px] text-muted-foreground">{Number(d.date.slice(8, 10))}</span>
                </div>
              );
            })}
          </div>
          {employeeSeries.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-2 border-t">
              {employeeSeries.map((emp) => (
                <div key={emp.userId} className="flex items-center gap-1.5 text-xs">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: colorFor(emp.userId) }} />
                  <span className="font-medium">{emp.name}</span>
                  <span className="text-muted-foreground">
                    {emp.hours.toFixed(1)}h{showCosts ? ` · ${inr(emp.burn)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>

      </Card>


      <Card>
        <CardHeader>
          <CardTitle>Burn by project / category</CardTitle>
          <CardDescription>
            Totals for {month} grouped by project across every department in view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {projectRollup.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No entries.</div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Contributors</TableHead>
                  {showCosts && <TableHead className="text-right">Burn</TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {projectRollup.map((r) => (
                    <TableRow key={r.code}>
                      <TableCell>
                        <span className="font-mono text-xs mr-2 text-muted-foreground">{r.code}</span>
                        {r.name}
                      </TableCell>
                      <TableCell className="text-right">{r.hours.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{r.contributors}</TableCell>
                      {showCosts && <TableCell className="text-right">{inr(r.burn)}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>Daily log</CardTitle>
          <CardDescription>{showCosts ? "Every entry contributing to burn this month." : "Every entry logged this month."}</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredDaily.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No entries.</div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Employee</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  {showCosts && <TableHead className="text-right">Burn</TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {filteredDaily.map((r, i) => (
                    <TableRow key={`${r.date}-${r.user_id}-${r.code}-${i}`}>
                      <TableCell className="text-xs">{format(new Date(r.date), "d MMM")}</TableCell>
                      <TableCell>{nameById.get(r.user_id) ?? "—"}</TableCell>
                      <TableCell><span className="font-mono text-xs mr-2 text-muted-foreground">{r.code}</span>{r.name}</TableCell>
                      <TableCell className="text-right">{r.hours.toFixed(1)}</TableCell>
                      {showCosts && <TableCell className="text-right">{inr(r.burn)}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">{icon}{label}</div>
      <div className="mt-2 text-2xl font-bold font-display">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </CardContent></Card>
  );
}
