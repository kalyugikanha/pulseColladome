import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { outputByEmployee, outputTrend } from "@/lib/analytics.functions";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/analytics")({ component: AnalyticsPage });

function currentMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function AnalyticsPage() {
  const [month, setMonth] = useState(currentMonthISO());
  const byEmpFn = useServerFn(outputByEmployee);
  const trendFn = useServerFn(outputTrend);

  const { data } = useQuery({
    queryKey: ["output-by-emp", month], queryFn: () => byEmpFn({ data: { month } }),
  });
  const { data: trend } = useQuery({
    queryKey: ["output-trend"], queryFn: () => trendFn({ data: { months: 6 } }),
  });

  const trendByEmp = useMemo(() => {
    const m = new Map<string, { employeeName: string; points: { month: string; count: number }[] }>();
    for (const p of trend ?? []) {
      const rec = m.get(p.employeeId) ?? { employeeName: p.employeeName, points: [] };
      rec.points.push({ month: p.month, count: p.count });
      m.set(p.employeeId, rec);
    }
    return m;
  }, [trend]);

  const months6 = useMemo(() => {
    const arr: string[] = [];
    const d = new Date();
    for (let i = 5; i >= 0; i--) {
      const dd = new Date(d.getFullYear(), d.getMonth() - i, 1);
      arr.push(`${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}`);
    }
    return arr;
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">Output Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">How much each teammate has completed this month. Historical months stay available.</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Month</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[160px]" />
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle className="font-display text-base">{format(new Date(month + "-01"), "MMMM yyyy")} · completed by task type</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="py-2 pr-4">Employee</th>
                <th className="py-2 pr-4">Dept</th>
                {(data?.types ?? []).map((t) => <th key={t} className="py-2 pr-4">{t}</th>)}
                <th className="py-2 pr-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.employeeId} className="border-b border-border/40">
                  <td className="py-2 pr-4 font-medium">{r.employeeName}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{r.department ?? "—"}</td>
                  {(data?.types ?? []).map((t) => <td key={t} className="py-2 pr-4">{r.counts[t] ?? 0}</td>)}
                  <td className="py-2 pr-4 text-right font-semibold">{r.total}</td>
                </tr>
              ))}
              {(data?.rows.length ?? 0) === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No completed tasks in this month.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display text-base">6-month trend</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[...trendByEmp.entries()].map(([empId, rec]) => {
            const max = Math.max(1, ...rec.points.map((p) => p.count));
            return (
              <div key={empId} className="space-y-1">
                <div className="text-sm font-medium">{rec.employeeName}</div>
                <div className="flex items-end gap-2 h-16">
                  {months6.map((m) => {
                    const c = rec.points.find((p) => p.month === m)?.count ?? 0;
                    return (
                      <div key={m} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full bg-primary/70 rounded-sm" style={{ height: `${(c / max) * 100}%` }} title={`${m}: ${c}`} />
                        <div className="text-[9px] text-muted-foreground">{m.slice(5)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {trendByEmp.size === 0 && <p className="text-sm text-muted-foreground">No trend data yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
