import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flame, IndianRupee, TrendingUp, CalendarDays } from "lucide-react";
import { format, getDaysInMonth } from "date-fns";

export const Route = createFileRoute("/_authenticated/project-burn")({
  component: ProjectBurnPage,
});

type Salary = { user_id: string; monthly_salary: number; effective_from: string };
type LogRow = { user_id: string; date: string; tasks: Array<{ project_code?: string; project_name?: string; hours?: number }> | null };
type Profile = { id: string; full_name: string | null; email: string | null };

function monthKey(d: Date) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }
const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function ProjectBurnPage() {
  const { data: me, isLoading } = useCurrentUser();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const { data: profiles } = useQuery({
    queryKey: ["pb-profiles"],
    enabled: !!me?.isFinanceAdmin,
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email")).data as Profile[] ?? [],
  });

  const { data: grants } = useQuery({
    queryKey: ["pb-grants"],
    enabled: !!me?.isFinanceAdmin,
    queryFn: async () => (await supabase.from("role_grants").select("email, default_monthly_salary")).data as Array<{ email: string; default_monthly_salary: number | null }> ?? [],
  });

  const { data: salaries } = useQuery({
    queryKey: ["pb-salaries"],
    enabled: !!me?.isFinanceAdmin,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("salaries").select("user_id, monthly_salary, effective_from").order("effective_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Salary[];
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["pb-logs", month],
    enabled: !!me?.isFinanceAdmin,
    queryFn: async () => {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      const { data, error } = await supabase.from("attendance_logs").select("user_id, date, tasks").gte("date", start).lt("date", end).order("date");
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const salaryByUser = useMemo(() => {
    const map = new Map<string, number>();
    if (!salaries) return map;
    const [y, m] = month.split("-").map(Number);
    const cutoff = new Date(Date.UTC(y, m, 0));
    for (const s of salaries) {
      if (new Date(s.effective_from) > cutoff) continue;
      if (!map.has(s.user_id)) map.set(s.user_id, Number(s.monthly_salary));
    }
    return map;
  }, [salaries, month]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles ?? []) m.set(p.id, p.full_name || p.email || "—");
    return m;
  }, [profiles]);

  // Monthly totals: per-user, sum hours per project (for salary-share)
  const monthlyUserTotals = useMemo(() => {
    const totals = new Map<string, number>(); // user_id -> monthly total hours
    for (const row of logs ?? []) {
      for (const t of row.tasks ?? []) {
        const h = Number(t.hours) || 0;
        if (h <= 0) continue;
        totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + h);
      }
    }
    return totals;
  }, [logs]);

  // Daily rows: [date, project_code, user_id, hours, burn]
  type DailyRow = { date: string; code: string; name: string; user_id: string; hours: number; burn: number };
  const dailyRows: DailyRow[] = useMemo(() => {
    const out: DailyRow[] = [];
    for (const row of logs ?? []) {
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
  }, [logs, monthlyUserTotals, salaryByUser]);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of dailyRows) if (!map.has(r.code)) map.set(r.code, r.name);
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [dailyRows]);

  const filteredDaily = useMemo(() => projectFilter === "all" ? dailyRows : dailyRows.filter((r) => r.code === projectFilter), [dailyRows, projectFilter]);

  // Aggregated by project
  const byProject = useMemo(() => {
    const m = new Map<string, { code: string; name: string; hours: number; burn: number; daysActive: Set<string> }>();
    for (const r of dailyRows) {
      const cur = m.get(r.code) ?? { code: r.code, name: r.name, hours: 0, burn: 0, daysActive: new Set<string>() };
      cur.hours += r.hours; cur.burn += r.burn; cur.daysActive.add(r.date);
      m.set(r.code, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.burn - a.burn);
  }, [dailyRows]);

  const totalBurn = byProject.reduce((s, p) => s + p.burn, 0);
  const totalHours = byProject.reduce((s, p) => s + p.hours, 0);
  const totalSalaryPool = useMemo(() => Array.from(salaryByUser.values()).reduce((s, v) => s + v, 0), [salaryByUser]);

  // Daily trend for selected project (or all)
  const daysInMonth = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return getDaysInMonth(new Date(y, m - 1, 1));
  }, [month]);
  const dailyTrend = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const arr = Array.from({ length: daysInMonth }, (_, i) => {
      const d = `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
      return { date: d, burn: 0, hours: 0 };
    });
    for (const r of filteredDaily) {
      const idx = Number(r.date.slice(8, 10)) - 1;
      if (arr[idx]) { arr[idx].burn += r.burn; arr[idx].hours += r.hours; }
    }
    return arr;
  }, [filteredDaily, month, daysInMonth]);
  const trendMax = Math.max(1, ...dailyTrend.map((d) => d.burn));

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!me?.isFinanceAdmin) throw redirect({ to: "/dashboard" });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2"><Flame className="h-6 w-6 text-primary" /> Project Burn</h1>
          <p className="text-sm text-muted-foreground">Daily burn allocated from salaries as team logs hours. Salary-share allocation.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="month" className="text-xs text-muted-foreground">Month</Label>
          <Input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
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
        <Stat icon={<IndianRupee className="h-4 w-4" />} label="Burned this month" value={inr(totalBurn)} sub={`${totalHours.toFixed(1)} hrs`} />
        <Stat icon={<TrendingUp className="h-4 w-4" />} label="Salary pool" value={inr(totalSalaryPool)} sub={`${salaryByUser.size} employees`} />
        <Stat icon={<Flame className="h-4 w-4" />} label="Coverage" value={totalSalaryPool > 0 ? `${((totalBurn / totalSalaryPool) * 100).toFixed(0)}%` : "—"} sub="of salary pool allocated" />
        <Stat icon={<CalendarDays className="h-4 w-4" />} label="Active projects" value={String(byProject.length)} sub="with logged hours" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily burn — {month}</CardTitle>
          <CardDescription>{projectFilter === "all" ? "All projects" : projects.find((p) => p.code === projectFilter)?.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-32">
            {dailyTrend.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.date}: ${inr(d.burn)} · ${d.hours.toFixed(1)}h`}>
                <div className="w-full rounded-t bg-primary/70" style={{ height: `${(d.burn / trendMax) * 100}%`, minHeight: d.burn > 0 ? 2 : 0 }} />
                <span className="text-[9px] text-muted-foreground">{Number(d.date.slice(8, 10))}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Burn by project</CardTitle></CardHeader>
        <CardContent>
          {byProject.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No time logged this month for users with salaries set.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Project</TableHead><TableHead>Code</TableHead>
                <TableHead className="text-right">Active days</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Burned so far</TableHead>
                <TableHead className="text-right">% of total</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {byProject.map((p) => (
                  <TableRow key={p.code}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="font-mono text-xs">{p.code}</TableCell>
                    <TableCell className="text-right">{p.daysActive.size}</TableCell>
                    <TableCell className="text-right">{p.hours.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-semibold">{inr(p.burn)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{totalBurn > 0 ? ((p.burn / totalBurn) * 100).toFixed(1) : "0"}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily log</CardTitle>
          <CardDescription>Every entry contributing to burn this month.</CardDescription>
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
                  <TableHead className="text-right">Burn</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredDaily.map((r, i) => (
                    <TableRow key={`${r.date}-${r.user_id}-${r.code}-${i}`}>
                      <TableCell className="text-xs">{format(new Date(r.date), "d MMM")}</TableCell>
                      <TableCell>{nameById.get(r.user_id) ?? "—"}</TableCell>
                      <TableCell><span className="font-mono text-xs mr-2 text-muted-foreground">{r.code}</span>{r.name}</TableCell>
                      <TableCell className="text-right">{r.hours.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{inr(r.burn)}</TableCell>
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
