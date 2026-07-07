import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { format, startOfWeek, endOfWeek, subDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/bd/reports")({ component: BDReportsPage });

type LogRow = {
  id: string;
  log_date: string;
  user_id: string;
  activity_type_id: string;
  hours_spent: number | null;
  status: string;
};

function BDReportsPage() {
  const { data: me } = useCurrentUser();
  const isAdmin = !!(me?.isAdmin || me?.isSuperAdmin);
  const today = new Date();
  const [from, setFrom] = useState(format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));

  const { data: logs } = useQuery({
    queryKey: ["bd-report-logs", from, to],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bd_activity_logs")
        .select("id, log_date, user_id, activity_type_id, hours_spent, status")
        .gte("log_date", from).lte("log_date", to);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["bd-profiles-all"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
  });

  const { data: types } = useQuery({
    queryKey: ["bd-types"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("bd_activity_types").select("*").order("sort_order");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const profileName = useMemo(() => {
    const m = new Map<string, string>();
    (profiles ?? []).forEach((p) => m.set(p.id, p.full_name ?? p.email ?? "?"));
    return m;
  }, [profiles]);
  const typeName = useMemo(() => {
    const m = new Map<string, string>();
    (types ?? []).forEach((t) => m.set(t.id, t.name));
    return m;
  }, [types]);

  // Chart data: one row per person, columns per activity type
  const chartData = useMemo(() => {
    if (!logs || !profiles || !types) return [];
    const perUser = new Map<string, Record<string, number | string>>();
    for (const l of logs) {
      if (!l.hours_spent) continue;
      const name = profileName.get(l.user_id) ?? "?";
      const t = typeName.get(l.activity_type_id) ?? "?";
      const row = perUser.get(name) ?? { person: name };
      row[t] = ((row[t] as number) ?? 0) + Number(l.hours_spent);
      perUser.set(name, row);
    }
    return Array.from(perUser.values());
  }, [logs, profiles, types, profileName, typeName]);

  // Table: user × type
  const tableRows = useMemo(() => {
    if (!logs) return [];
    const map = new Map<string, { user: string; totals: Map<string, number>; total: number }>();
    for (const l of logs) {
      if (!l.hours_spent) continue;
      const user = profileName.get(l.user_id) ?? "?";
      const t = typeName.get(l.activity_type_id) ?? "?";
      const entry = map.get(user) ?? { user, totals: new Map(), total: 0 };
      entry.totals.set(t, (entry.totals.get(t) ?? 0) + Number(l.hours_spent));
      entry.total += Number(l.hours_spent);
      map.set(user, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [logs, profileName, typeName]);

  const typeNames = useMemo(() => (types ?? []).map((t) => t.name), [types]);

  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

  function exportCsv() {
    const header = ["User", ...typeNames, "Total"];
    const rows = tableRows.map((r) => [
      r.user,
      ...typeNames.map((t) => (r.totals.get(t) ?? 0).toFixed(2)),
      r.total.toFixed(2),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bd-report-${from}-to-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function setRange(days: number) {
    setFrom(format(subDays(today, days - 1), "yyyy-MM-dd"));
    setTo(format(today, "yyyy-MM-dd"));
  }
  function setThisWeek() {
    setFrom(format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    setTo(format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  }

  if (!isAdmin) return <p className="text-sm text-muted-foreground">Admins only.</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
          <Button variant="outline" size="sm" onClick={setThisWeek}>This week</Button>
          <Button variant="outline" size="sm" onClick={() => setRange(7)}>Last 7 days</Button>
          <Button variant="outline" size="sm" onClick={() => setRange(30)}>Last 30 days</Button>
          <div className="ml-auto">
            <Button size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Hours by activity type per team member</CardTitle></CardHeader>
        <CardContent style={{ height: 360 }}>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No logged hours in this range.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="person" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {typeNames.map((t, i) => (
                  <Bar key={t} dataKey={t} stackId="a" fill={colors[i % colors.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Totals table</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team member</TableHead>
                  {typeNames.map((t) => <TableHead key={t} className="text-right">{t}</TableHead>)}
                  <TableHead className="text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.map((r) => (
                  <TableRow key={r.user}>
                    <TableCell className="font-medium">{r.user}</TableCell>
                    {typeNames.map((t) => (
                      <TableCell key={t} className="text-right">{(r.totals.get(t) ?? 0).toFixed(1)}</TableCell>
                    ))}
                    <TableCell className="text-right font-bold">{r.total.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
                {tableRows.length === 0 && (
                  <TableRow><TableCell colSpan={typeNames.length + 2} className="text-center text-muted-foreground py-8">No data</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
