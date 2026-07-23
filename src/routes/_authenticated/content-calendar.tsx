import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarCheck, ChevronLeft, ChevronRight, LayoutGrid, Table as TableIcon, ChevronDown } from "lucide-react";
import { TaskTypeBadges, type TaskTypeLite } from "@/components/tasks/task-type-badges";
import { MultiSelectFilter, UNASSIGNED } from "@/components/multi-select-filter";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { updateTaskFields } from "@/lib/tasks-workflow.functions";
import { setTaskPlatforms } from "@/lib/tasks-plus.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/content-calendar")({
  head: () => ({
    meta: [
      { title: "Content Calendar — Colladome Pulse" },
      { name: "description", content: "Plan and track content posts across every workflow, in a calendar or spreadsheet view." },
      { property: "og:title", content: "Content Calendar — Colladome Pulse" },
      { property: "og:description", content: "Plan and track content posts across every workflow." },
    ],
  }),
  component: ContentCalendarPage,
});

type TaskStatus = "todo" | "in_progress" | "review" | "done";

type ContentTask = {
  id: string;
  title: string;
  status: TaskStatus;
  scheduled_post_date: string | null;
  due_date: string | null;
  assignee_id: string | null;
  assignee: { id: string; full_name: string | null; email: string | null } | null;
  project: { id: string; name: string; code: string | null } | null;
  taskTypes: TaskTypeLite[];
  platforms: TaskTypeLite[];
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "bg-slate-500",
  in_progress: "bg-blue-600",
  review: "bg-amber-600",
  done: "bg-emerald-600",
};

async function fetchContentTasks(): Promise<ContentTask[]> {
  // 1) Content workflow templates
  const { data: templates } = await supabase.from("workflow_templates" as never)
    .select("id").eq("is_content_workflow" as never, true as never);
  const templateIds = ((templates ?? []) as unknown as Array<{ id: string }>).map((t) => t.id);
  if (templateIds.length === 0) return [];

  // 2) Workflow instances for those templates
  const { data: instances } = await supabase.from("workflow_instances" as never)
    .select("id").in("template_id", templateIds);
  const instanceIds = ((instances ?? []) as unknown as Array<{ id: string }>).map((i) => i.id);
  if (instanceIds.length === 0) return [];

  // 3) Tasks under those instances
  const { data: tasks } = await supabase.from("tasks").select(`
    id, title, status, scheduled_post_date, due_date, assignee_id,
    assignee:profiles!tasks_assignee_profile_fkey(id, full_name, email),
    project:projects(id, name, code)
  `).in("workflow_instance_id", instanceIds).eq("is_recurring_template" as never, false as never);
  const rows = ((tasks ?? []) as unknown as Array<Omit<ContentTask, "taskTypes" | "platforms">>);
  if (rows.length === 0) return [];

  // 4) Task types (incl. platforms)
  const taskIds = rows.map((r) => r.id);
  const { data: tt } = await supabase.from("task_task_types")
    .select("task_id, task_type:taxonomy_task_types(id, name, category)")
    .in("task_id", taskIds);
  const byTask = new Map<string, TaskTypeLite[]>();
  for (const r of ((tt ?? []) as unknown as Array<{ task_id: string; task_type: { id: string; name: string; category: string | null } | null }>)) {
    if (!r.task_type) continue;
    const list = byTask.get(r.task_id) ?? [];
    list.push({ id: r.task_type.id, name: r.task_type.name, category: r.task_type.category });
    byTask.set(r.task_id, list);
  }

  return rows.map((r) => {
    const types = byTask.get(r.id) ?? [];
    return {
      ...r,
      taskTypes: types,
      platforms: types.filter((t) => t.category === "platform"),
    };
  });
}

function ContentCalendarPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"calendar" | "table">("calendar");
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => { const d = new Date(); d.setDate(1); return d; });
  const [platformSel, setPlatformSel] = useState<Set<string>>(new Set());
  const [ownerSel, setOwnerSel] = useState<Set<string>>(new Set());
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set());
  const [projectSel, setProjectSel] = useState<Set<string>>(new Set());
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const updateFn = useServerFn(updateTaskFields);
  const setPlatformsFn = useServerFn(setTaskPlatforms);

  const { data: allTasks } = useQuery({ queryKey: ["content-cal-tasks"], queryFn: fetchContentTasks });
  const { data: platforms } = useQuery({
    queryKey: ["taxonomy-platforms"],
    queryFn: async () => {
      const { data } = await supabase.from("taxonomy_task_types")
        .select("id, name").eq("active", true).eq("category" as never, "platform" as never).order("name");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const owners = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of allTasks ?? []) {
      if (t.assignee) m.set(t.assignee.id, t.assignee.full_name ?? t.assignee.email ?? "—");
    }
    return Array.from(m.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [allTasks]);

  const projects = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of allTasks ?? []) {
      if (t.project) {
        const label = t.project.code ? `${t.project.code} — ${t.project.name}` : t.project.name;
        m.set(t.project.id, label);
      }
    }
    return Array.from(m.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [allTasks]);

  const filtered = useMemo(() => {
    const rows = allTasks ?? [];
    return rows.filter((t) => {
      if (statusSel.size > 0 && !statusSel.has(t.status)) return false;
      if (ownerSel.size > 0) {
        const own = t.assignee?.id ?? UNASSIGNED;
        if (!ownerSel.has(own)) return false;
      }
      if (projectSel.size > 0) {
        const pid = t.project?.id ?? UNASSIGNED;
        if (!projectSel.has(pid)) return false;
      }
      if (platformSel.size > 0) {
        const ids = t.platforms.map((p) => p.id);
        if (ids.length === 0) return false;
        if (!ids.some((id) => platformSel.has(id))) return false;
      }
      return true;
    });
  }, [allTasks, statusSel, ownerSel, projectSel, platformSel]);

  async function invalidate() { await qc.invalidateQueries({ queryKey: ["content-cal-tasks"] }); }

  async function saveDate(taskId: string, iso: string | null) {
    try {
      await updateFn({ data: { taskId, patch: { scheduled_post_date: iso } } });
      toast.success(iso ? "Rescheduled" : "Removed from calendar");
      await invalidate();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function saveStatus(taskId: string, status: TaskStatus) {
    try {
      await updateFn({ data: { taskId, patch: { } as never } });
      // updateTaskFields doesn't include status → use direct update via supabase RLS.
      const { error } = await supabase.from("tasks").update({ status } as never).eq("id", taskId);
      if (error) throw error;
      toast.success("Status updated");
      await invalidate();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function savePlatforms(taskId: string, ids: string[]) {
    try {
      await setPlatformsFn({ data: { taskId, platformIds: ids } });
      await invalidate();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <CalendarCheck className="h-7 w-7 text-primary" /> Content Calendar
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Plan posts from every content workflow. Tasks with no scheduled post date show in the Unscheduled tray.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MultiSelectFilter label="Platform" options={(platforms ?? []).map((p) => ({ value: p.id, label: p.name }))} selected={platformSel} onChange={setPlatformSel} />
          <MultiSelectFilter label="Owner" options={owners} selected={ownerSel} onChange={setOwnerSel} includeUnassigned />
          <MultiSelectFilter label="Status" options={(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))} selected={statusSel} onChange={setStatusSel} />
          <div className="inline-flex rounded-md border overflow-hidden">
            <Button variant={mode === "calendar" ? "default" : "ghost"} size="sm" className="rounded-none h-9" onClick={() => setMode("calendar")}>
              <LayoutGrid className="h-4 w-4 mr-1" /> Calendar
            </Button>
            <Button variant={mode === "table" ? "default" : "ghost"} size="sm" className="rounded-none h-9" onClick={() => setMode("table")}>
              <TableIcon className="h-4 w-4 mr-1" /> Table
            </Button>
          </div>
        </div>
      </header>

      {!allTasks ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : mode === "calendar" ? (
        <CalendarView
          tasks={filtered}
          anchor={monthAnchor}
          setAnchor={setMonthAnchor}
          onOpen={setOpenTaskId}
          onDateChange={saveDate}
        />
      ) : (
        <TableView
          tasks={filtered}
          platforms={platforms ?? []}
          onOpen={setOpenTaskId}
          onDateChange={saveDate}
          onStatusChange={saveStatus}
          onPlatformsChange={savePlatforms}
        />
      )}

      <TaskDetailSheet
        taskId={openTaskId}
        initialAction={null}
        onClose={(next) => { setOpenTaskId(next ?? null); invalidate(); }}
      />
    </div>
  );
}

function startOfMonth(d: Date) { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function toIsoDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function fromIso(iso: string) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m-1, d); }

function CalendarView({ tasks, anchor, setAnchor, onOpen, onDateChange }: {
  tasks: ContentTask[]; anchor: Date; setAnchor: (d: Date) => void;
  onOpen: (id: string) => void; onDateChange: (id: string, iso: string | null) => void;
}) {
  const first = startOfMonth(anchor);
  const startWeekday = (first.getDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const monthLabel = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const scheduled = tasks.filter((t) => t.scheduled_post_date);
  const unscheduled = tasks.filter((t) => !t.scheduled_post_date);
  const byDay = new Map<string, ContentTask[]>();
  for (const t of scheduled) {
    if (!t.scheduled_post_date) continue;
    const key = t.scheduled_post_date;
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(t);
  }

  const cells: Array<{ date: Date | null }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(first.getFullYear(), first.getMonth(), d) });
  while (cells.length % 7 !== 0) cells.push({ date: null });

  const todayIso = toIsoDate(new Date());

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="font-display text-lg">{monthLabel}</div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAnchor(addMonths(anchor, -1))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setAnchor(startOfMonth(new Date()))}>Today</Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAnchor(addMonths(anchor, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-px bg-border rounded overflow-hidden text-xs">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
              <div key={d} className="bg-muted/70 text-center py-1.5 text-[11px] font-semibold text-muted-foreground">{d}</div>
            ))}
            {cells.map((c, i) => {
              const iso = c.date ? toIsoDate(c.date) : null;
              const items = iso ? (byDay.get(iso) ?? []) : [];
              const isToday = iso === todayIso;
              return (
                <div key={i} className={`min-h-[110px] bg-background p-1.5 ${isToday ? "ring-1 ring-inset ring-primary/60" : ""}`}>
                  {c.date && (
                    <>
                      <div className="text-[11px] font-medium text-muted-foreground mb-1">{c.date.getDate()}</div>
                      <div className="space-y-1">
                        {items.slice(0, 4).map((t) => (
                          <CalendarChip key={t.id} task={t} onOpen={onOpen} onDateChange={onDateChange} />
                        ))}
                        {items.length > 4 && <div className="text-[10px] text-muted-foreground pl-1">+ {items.length - 4} more</div>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="font-display text-sm font-semibold">Unscheduled ({unscheduled.length})</div>
          <p className="text-[11px] text-muted-foreground">Tasks with no scheduled post date. Set a date to place them on the calendar.</p>
          <div className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
            {unscheduled.length === 0 && <div className="text-xs text-muted-foreground py-2">Nothing waiting.</div>}
            {unscheduled.map((t) => (
              <div key={t.id} className="rounded border p-2 space-y-1 hover:border-primary/40">
                <button className="text-xs font-medium text-left w-full truncate hover:underline" onClick={() => onOpen(t.id)}>{t.title}</button>
                <div className="text-[10px] text-muted-foreground truncate">
                  {t.project?.code ?? "—"} · {t.assignee?.full_name ?? t.assignee?.email ?? "Unassigned"}
                </div>
                <div className="flex flex-wrap gap-1">
                  <TaskTypeBadges types={t.platforms} size="xs" />
                </div>
                <div>
                  <Input type="date" className="h-7 text-xs" onChange={(e) => e.target.value && onDateChange(t.id, e.target.value)} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CalendarChip({ task, onOpen, onDateChange }: {
  task: ContentTask; onOpen: (id: string) => void; onDateChange: (id: string, iso: string | null) => void;
}) {
  const platformName = task.platforms[0]?.name ?? null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`w-full text-left rounded px-1.5 py-0.5 text-[10px] text-white truncate ${STATUS_COLORS[task.status]}`}
          title={`${task.title} · ${STATUS_LABELS[task.status]}${platformName ? " · " + platformName : ""}`}
        >
          {task.title}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 space-y-2" align="start">
        <div className="text-xs font-medium">{task.title}</div>
        <div className="text-[10px] text-muted-foreground">{task.project?.code ?? "—"} · {STATUS_LABELS[task.status]}</div>
        <div className="flex flex-wrap gap-1"><TaskTypeBadges types={task.platforms} size="xs" /></div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Reschedule</div>
          <Input type="date" defaultValue={task.scheduled_post_date ?? ""} className="h-7 text-xs"
            onChange={(e) => e.target.value && onDateChange(task.id, e.target.value)} />
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => onOpen(task.id)}>Open</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onDateChange(task.id, null)}>Unschedule</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TableView({ tasks, platforms, onOpen, onDateChange, onStatusChange, onPlatformsChange }: {
  tasks: ContentTask[];
  platforms: Array<{ id: string; name: string }>;
  onOpen: (id: string) => void;
  onDateChange: (id: string, iso: string | null) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
  onPlatformsChange: (id: string, ids: string[]) => void;
}) {
  const [sortKey, setSortKey] = useState<"date" | "title" | "owner" | "status" | "project">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    const rows = [...tasks];
    rows.sort((a, b) => {
      let av = ""; let bv = "";
      switch (sortKey) {
        case "date": av = a.scheduled_post_date ?? "9999-12-31"; bv = b.scheduled_post_date ?? "9999-12-31"; break;
        case "title": av = a.title; bv = b.title; break;
        case "owner": av = a.assignee?.full_name ?? a.assignee?.email ?? "~"; bv = b.assignee?.full_name ?? b.assignee?.email ?? "~"; break;
        case "status": av = a.status; bv = b.status; break;
        case "project": av = a.project?.code ?? "~"; bv = b.project?.code ?? "~"; break;
      }
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [tasks, sortKey, sortDir]);

  function head(key: typeof sortKey, label: string) {
    const active = sortKey === key;
    return (
      <button className={`text-left w-full font-semibold ${active ? "text-primary" : ""}`}
        onClick={() => { if (active) setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir("asc"); } }}>
        {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr>
              <th className="p-2 w-36">{head("date", "Post date")}</th>
              <th className="p-2">{head("title", "Title")}</th>
              <th className="p-2 w-56">Platforms</th>
              <th className="p-2 w-40">{head("owner", "Owner")}</th>
              <th className="p-2 w-32">{head("status", "Status")}</th>
              <th className="p-2 w-40">{head("project", "Project")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-xs">No tasks match this filter.</td></tr>
            )}
            {sorted.map((t) => (
              <tr key={t.id} className="hover:bg-muted/30">
                <td className="p-2">
                  <Input type="date" defaultValue={t.scheduled_post_date ?? ""} className="h-8 text-xs"
                    onChange={(e) => onDateChange(t.id, e.target.value || null)} />
                </td>
                <td className="p-2">
                  <button className="text-left hover:underline font-medium" onClick={() => onOpen(t.id)}>{t.title}</button>
                </td>
                <td className="p-2">
                  <PlatformPicker
                    all={platforms}
                    value={t.platforms.map((p) => p.id)}
                    onChange={(ids) => onPlatformsChange(t.id, ids)}
                  />
                </td>
                <td className="p-2 text-xs text-muted-foreground truncate">{t.assignee?.full_name ?? t.assignee?.email ?? "—"}</td>
                <td className="p-2">
                  <Select value={t.status} onValueChange={(v) => onStatusChange(t.id, v as TaskStatus)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-2 text-xs text-muted-foreground">
                  {t.project ? <><span className="font-mono">{t.project.code}</span> <span className="truncate">{t.project.name}</span></> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function PlatformPicker({ all, value, onChange }: {
  all: Array<{ id: string; name: string }>;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const selected = all.filter((p) => value.includes(p.id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-full justify-between font-normal">
          <span className="truncate text-left text-xs">
            {selected.length === 0 ? <span className="text-muted-foreground">Add platforms</span>
              : selected.map((p) => p.name).join(", ")}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        {all.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">No platforms defined.</p>}
        {all.map((p) => {
          const checked = value.includes(p.id);
          return (
            <label key={p.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer">
              <Checkbox checked={checked} onCheckedChange={() => onChange(checked ? value.filter((x) => x !== p.id) : [...value, p.id])} />
              <span className="text-sm">{p.name}</span>
              {checked && <Badge variant="secondary" className="text-[10px] ml-auto">on</Badge>}
            </label>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
