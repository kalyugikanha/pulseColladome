import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TableProperties, CalendarIcon, Pencil, CheckCircle2, Lock, Plus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { DayEditorSheet } from "@/components/day-editor-sheet";

export const Route = createFileRoute("/_authenticated/my-timesheet")({
  component: MyTimesheetPage,
});

type Task = { project_code?: string; project_name?: string; hours?: number; comments?: string };
type LogRow = { id: string; date: string; tasks: Task[] | null; approved_at: string | null };

type ViewMode = "month" | "range" | "day";

function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function startOfWeek(d: Date) { const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() - ((day + 6) % 7)); return x; }

function MyTimesheetPage() {
  const { data: me, isLoading } = useCurrentUser();
  const [view, setView] = useState<ViewMode>("month");
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [rangeFrom, setRangeFrom] = useState<Date>(() => startOfWeek(new Date()));
  const [rangeTo, setRangeTo] = useState<Date>(() => new Date());
  const [day, setDay] = useState<Date>(() => new Date());
  const [editor, setEditor] = useState<{ date: string } | null>(null);

  const { startIso, endIso, label } = useMemo(() => {
    if (view === "month") {
      const [y, m] = month.split("-").map(Number);
      return { startIso: ymd(new Date(y, m - 1, 1)), endIso: ymd(new Date(y, m, 1)), label: month };
    }
    if (view === "range") {
      const e = new Date(rangeTo); e.setDate(e.getDate() + 1);
      return { startIso: ymd(rangeFrom), endIso: ymd(e), label: `${format(rangeFrom, "d MMM")} – ${format(rangeTo, "d MMM yyyy")}` };
    }
    const e = new Date(day); e.setDate(e.getDate() + 1);
    return { startIso: ymd(day), endIso: ymd(e), label: format(day, "EEEE, d MMM yyyy") };
  }, [view, month, rangeFrom, rangeTo, day]);

  const { data: logs } = useQuery({
    queryKey: ["my-ts-logs", me?.id, startIso, endIso],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance_logs")
        .select("id, date, tasks, approved_at")
        .eq("user_id", me!.id)
        .gte("date", startIso).lt("date", endIso)
        .order("date");
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  // Kanban-logged hours (task_activity rows this user actioned).
  const { data: activityRows } = useQuery({
    queryKey: ["my-ts-activity", me?.id, startIso, endIso],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_activity" as any)
        .select("id, task_id, hours, note, completion_date, created_at, approval_status, task:tasks(id, title, project:projects(id, code, name))")
        .eq("actor_id", me!.id)
        .not("hours", "is", null)
        .neq("approval_status", "rejected")
        .gte("completion_date", startIso).lt("completion_date", endIso);
      if (error) throw error;
      return ((data ?? []) as unknown as Array<{
        id: string; task_id: string; hours: number | null; note: string | null;
        completion_date: string | null; created_at: string; approval_status: string;
        task: { id: string; title: string | null; project: { id: string; code: string | null; name: string | null } | null } | null;
      }>);
    },
  });

  // Flatten to (date, project, hours, comments)
  type Row = { date: string; code: string; name: string; hours: number; comments?: string; approved: boolean; pending?: boolean; taskId?: string };
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const l of logs ?? []) {
      for (const t of l.tasks ?? []) {
        const code = t.project_code?.trim(); const h = Number(t.hours) || 0;
        if (!code || h <= 0) continue;
        out.push({ date: l.date, code, name: t.project_name || code, hours: h, comments: t.comments, approved: !!l.approved_at });
      }
    }
    for (const a of activityRows ?? []) {
      const h = Number(a.hours) || 0;
      if (h <= 0) continue;
      const date = a.completion_date ?? a.created_at.slice(0, 10);
      const proj = a.task?.project;
      const code = proj?.code?.trim() || "—";
      const name = proj?.name || a.task?.title || "Task";
      const approved = a.approval_status === "approved" || a.approval_status === "auto";
      out.push({
        date, code, name, hours: h,
        comments: a.note ?? a.task?.title ?? undefined,
        approved,
        pending: !approved,
        taskId: a.task_id,
      });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [logs, activityRows]);

  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const uniqueDays = new Set(rows.map((r) => r.date)).size;

  // Unique dates in period (for quick add / edit chips)
  const dateList = useMemo(() => Array.from(new Set(rows.map((r) => r.date))), [rows]);

  if (isLoading || !me) return <div className="text-muted-foreground">Loading…</div>;

  const userName = me.fullName ?? me.email ?? "You";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <TableProperties className="h-6 w-6 text-primary" /> My Timesheet
          </h1>
          <p className="text-sm text-muted-foreground">Your hours logged. Approved days are locked — ask your manager to unapprove if you need to fix something.</p>
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
            const months = [["01","January"],["02","February"],["03","March"],["04","April"],["05","May"],["06","June"],["07","July"],["08","August"],["09","September"],["10","October"],["11","November"],["12","December"]] as const;
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
          <Button size="sm" onClick={() => setEditor({ date: view === "day" ? ymd(day) : ymd(new Date()) })}>
            <Plus className="h-4 w-4 mr-1" /> Log time
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{label}</CardTitle>
          <CardDescription>{totalHours.toFixed(1)} hrs across {uniqueDays} day{uniqueDays === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 text-center">No entries in this period. Click "Log time" to add one.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead><TableHead>Project</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Comments</TableHead><TableHead>Status</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={`${r.date}-${r.code}-${i}`}>
                    <TableCell className="text-xs">{format(new Date(r.date + "T00:00:00"), "d MMM")}</TableCell>
                    <TableCell><span className="font-mono text-xs mr-2 text-muted-foreground">{r.code}</span>{r.name}</TableCell>
                    <TableCell className="text-right font-mono">{r.hours.toFixed(1)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.comments ?? ""}</TableCell>
                    <TableCell>
                      {r.approved
                        ? <Badge variant="secondary" className="gap-1 text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-300"><Lock className="h-3 w-3" /> Approved</Badge>
                        : r.pending
                          ? <Badge variant="outline" className="text-amber-700 border-amber-500/60">Awaiting approval</Badge>
                          : <Badge variant="outline">Pending</Badge>}
                    </TableCell>
                    <TableCell>
                      {r.taskId ? (
                        <span className="text-xs text-muted-foreground">via task</span>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditor({ date: r.date })}>
                          <Pencil className="h-3 w-3 mr-1" /> {r.approved ? "View" : "Edit"}
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

      {dateList.length > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="h-3 w-3" />
          Approved days in this period: {dateList.filter((d) => (logs ?? []).some((l) => l.date === d && l.approved_at)).length} of {dateList.length}.
        </p>
      )}

      {editor && (
        <DayEditorSheet
          open={!!editor}
          onOpenChange={(o) => !o && setEditor(null)}
          userId={me.id}
          userName={userName}
          date={editor.date}
          canEdit={true}
          canApprove={false}
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
