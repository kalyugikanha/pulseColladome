import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock, Plus } from "lucide-react";
import { toast } from "sonner";
import { MultiSelectFilter, UNASSIGNED } from "@/components/multi-select-filter";

export const Route = createFileRoute("/_authenticated/hours-editor")({
  component: HoursEditorPage,
});

type Profile = { id: string; full_name: string | null; email: string | null; department: string | null; is_placeholder: boolean };
type Project = { id: string; code: string; name: string };
type Task = { project_code: string; project_name?: string; hours: number };
type Log = { id: string; user_id: string; date: string; tasks: Task[] | null; total_hours: number | null };

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end), firstDay: iso(start) };
}

function HoursEditorPage() {
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!meLoading && me && !me.canManageProjects) navigate({ to: "/dashboard", replace: true });
  }, [me, meLoading, navigate]);


  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [addFor, setAddFor] = useState<string | null>(null);
  const [addCode, setAddCode] = useState<string>("");

  const enabled = !!me?.isSuperAdmin;

  const { data: profiles } = useQuery({
    queryKey: ["hours-editor-profiles"],
    enabled,
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email, department, is_placeholder").order("full_name")).data as Profile[] ?? [],
  });

  const { data: projects } = useQuery({
    queryKey: ["hours-editor-projects"],
    enabled,
    queryFn: async () => (await supabase.from("projects").select("id, code, name").order("code")).data as Project[] ?? [],
  });

  const { data: logs, refetch } = useQuery({
    queryKey: ["hours-editor-logs", month],
    enabled,
    queryFn: async () => {
      const { start, end } = monthBounds(month);
      const { data } = await supabase.from("attendance_logs").select("id, user_id, date, tasks, total_hours").gte("date", start).lt("date", end);
      return (data as Log[] | null) ?? [];
    },
  });

  // Aggregate hours per user per project for the selected month.
  const userMonthly = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    (logs ?? []).forEach((row) => {
      const per = map.get(row.user_id) ?? new Map<string, number>();
      (row.tasks ?? []).forEach((t) => {
        if (!t?.project_code) return;
        per.set(t.project_code, (per.get(t.project_code) ?? 0) + (Number(t.hours) || 0));
      });
      map.set(row.user_id, per);
    });
    return map;
  }, [logs]);

  const projectByCode = useMemo(() => {
    const m = new Map<string, Project>();
    (projects ?? []).forEach((p) => m.set(p.code, p));
    return m;
  }, [projects]);

  async function saveCell(userId: string, code: string, hours: number) {
    const { firstDay } = monthBounds(month);
    const project = projectByCode.get(code);
    if (!project) return;
    // Read the existing (user, first-of-month) row, if any.
    const { data: existing } = await supabase.from("attendance_logs").select("id, tasks").eq("user_id", userId).eq("date", firstDay).maybeSingle();
    const existingTasks: Task[] = ((existing?.tasks as Task[] | null) ?? []).filter((t) => t?.project_code !== code);
    if (hours > 0) existingTasks.push({ project_code: code, project_name: project.name, hours });
    const total = existingTasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
    if (existing?.id) {
      const { error } = await supabase.from("attendance_logs").update({ tasks: existingTasks, total_hours: total }).eq("id", existing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("attendance_logs").insert({ user_id: userId, date: firstDay, tasks: existingTasks, total_hours: total });
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["hours-editor-logs"] });
    refetch();
  }

  if (meLoading || !me) return <div className="text-muted-foreground">Loading…</div>;
  if (!me.isSuperAdmin) return null;

  const rows = (profiles ?? []).slice().sort((a, b) => {
    const ad = a.department ?? "zzz";
    const bd = b.department ?? "zzz";
    if (ad !== bd) return ad.localeCompare(bd);
    return (a.full_name ?? "").localeCompare(b.full_name ?? "");
  });

  // Columns = union of all project codes that have hours this month, sorted.
  const activeCodes = Array.from(new Set(Array.from(userMonthly.values()).flatMap((m) => Array.from(m.keys())))).sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2"><Clock className="h-6 w-6" /> Hours editor</h1>
          <p className="text-sm text-muted-foreground">Super admin only. Edit any teammate's monthly hours per project.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly hours grid</CardTitle>
          <CardDescription>Type a number and press Enter or Tab to save. Empty (or 0) removes the project from that user's month.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px] sticky left-0 bg-background z-10">Teammate</TableHead>
                <TableHead className="min-w-[110px]">Department</TableHead>
                {activeCodes.map((c) => (
                  <TableHead key={c} className="text-right min-w-[100px]" title={projectByCode.get(c)?.name ?? c}>
                    <div className="font-mono text-[10px]">{c}</div>
                    <div className="text-[10px] font-normal text-muted-foreground truncate max-w-[110px]">{projectByCode.get(c)?.name ?? "—"}</div>
                  </TableHead>
                ))}
                <TableHead className="min-w-[110px]">Add project</TableHead>
                <TableHead className="text-right min-w-[70px]">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const per = userMonthly.get(p.id) ?? new Map<string, number>();
                const total = Array.from(per.values()).reduce((s, v) => s + v, 0);
                const availableCodes = (projects ?? []).filter((pr) => !per.has(pr.code));
                return (
                  <TableRow key={p.id}>
                    <TableCell className="sticky left-0 bg-background z-10">
                      <div className="font-medium text-sm">{p.full_name ?? "—"}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        {p.email ?? "—"}
                        {p.is_placeholder && <Badge variant="outline" className="text-[9px] px-1 py-0">mock</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.department ?? "—"}</TableCell>
                    {activeCodes.map((c) => (
                      <TableCell key={c} className="text-right">
                        <HourCell
                          value={per.get(c) ?? 0}
                          onSave={(v) => saveCell(p.id, c, v)}
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      {addFor === p.id ? (
                        <div className="flex items-center gap-1">
                          <Select value={addCode} onValueChange={setAddCode}>
                            <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Project" /></SelectTrigger>
                            <SelectContent className="max-h-72">
                              {availableCodes.map((pr) => (
                                <SelectItem key={pr.code} value={pr.code}>{pr.code} · {pr.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" className="h-8 px-2" onClick={async () => {
                            if (!addCode) return;
                            await saveCell(p.id, addCode, 1);
                            setAddFor(null); setAddCode("");
                          }}>Add</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setAddFor(p.id); setAddCode(""); }}>
                          <Plus className="h-3 w-3 mr-1" /> Add
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{total.toFixed(0)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function HourCell({ value, onSave }: { value: number; onSave: (v: number) => void | Promise<void> }) {
  const [v, setV] = useState<string>(value ? String(value) : "");
  useEffect(() => { setV(value ? String(value) : ""); }, [value]);
  return (
    <Input
      type="number"
      min={0}
      step={0.5}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v) || 0;
        if (n !== value) onSave(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-8 w-20 text-right font-mono text-sm ml-auto"
    />
  );
}
