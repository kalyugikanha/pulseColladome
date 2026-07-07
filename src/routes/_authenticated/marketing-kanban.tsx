import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Send, Check, Undo2, AlertTriangle, ExternalLink, ArrowRightLeft, Settings2, Clock } from "lucide-react";
import { toast } from "sonner";
import { format, isPast, parseISO } from "date-fns";
import {
  DndContext, PointerSensor, useSensor, useSensors, useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent, DragOverlay,
} from "@dnd-kit/core";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";

const searchSchema = z.object({ assignee: z.string().optional() });

export const Route = createFileRoute("/_authenticated/marketing-kanban")({
  validateSearch: searchSchema,
  component: MarketingKanbanPage,
});

type Stage = "script_writing" | "script_wip" | "design" | "review" | "posting" | "posted";
const COLUMNS: { key: Stage; label: string }[] = [
  { key: "script_writing", label: "Script Writing" },
  { key: "script_wip", label: "Script Writing – In Progress" },
  { key: "design", label: "Design" },
  { key: "review", label: "Review" },
  { key: "posting", label: "Posting" },
  { key: "posted", label: "Posted" },
];

const DEPT = "Marketing";

type KanbanTask = {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  scheduled_post_date: string | null;
  marketing_stage: Stage;
  assignee_id: string | null;
  client_brand: string | null;
  origin_department: string | null;
  requester_id: string | null;
  asset_links: { label: string; url: string }[] | null;
  project_id: string | null;
  project: { id: string; code: string | null; name: string | null } | null;
  assignee: { id: string; full_name: string | null; email: string | null } | null;
  requester: { id: string; full_name: string | null } | null;
};

function initialsOf(name?: string | null, email?: string | null) {
  const s = (name ?? email ?? "?").trim();
  return s.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function MarketingKanbanPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const search = useSearch({ from: "/_authenticated/marketing-kanban" }) as { assignee?: string };
  const navigate = useNavigate({ from: "/marketing-kanban" });
  const assigneeFilter = search.assignee ?? "all";
  const setAssignee = (v: string) =>
    navigate({ search: (prev: { assignee?: string }) => ({ ...prev, assignee: v === "all" ? undefined : v }) });

  const [newOpen, setNewOpen] = useState(false);
  const [crossOpen, setCrossOpen] = useState(false);
  const [clientsOpen, setClientsOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const { data: myDept } = useQuery({
    queryKey: ["my-dept", me?.realId], enabled: !!me?.realId, staleTime: 5 * 60_000,
    queryFn: async () => (await supabase.from("profiles").select("department").eq("id", me!.realId).maybeSingle()).data?.department ?? null,
  });
  const isMarketingHead = !!me?.headOfDepartments.some((d) => d.toLowerCase() === "marketing");
  const isMarketingMember = !!me && (
    (myDept ?? "").toLowerCase() === "marketing" || isMarketingHead || me.isAdmin || me.isSuperAdmin
  );
  const canAssignAny = !!me && (me.isAdmin || me.isSuperAdmin || isMarketingHead);

  // Roster: profiles whose reporting_manager is the Marketing head, plus the head.
  const { data: roster } = useQuery({
    queryKey: ["mkt-roster"],
    queryFn: async () => {
      const { data: heads } = await supabase
        .from("department_heads").select("user_id").eq("department", DEPT);
      const headIds = (heads ?? []).map((h: any) => h.user_id).filter(Boolean);
      const idSet = new Set<string>(headIds);
      if (headIds.length) {
        const { data: reports } = await supabase
          .from("profiles").select("id").in("reporting_manager_id", headIds);
        (reports ?? []).forEach((r: any) => idSet.add(r.id));
      }
      // Also include anyone whose department is Marketing (safety net).
      const { data: deptMembers } = await supabase
        .from("profiles").select("id").eq("department", DEPT);
      (deptMembers ?? []).forEach((r: any) => idSet.add(r.id));
      const ids = Array.from(idSet);
      if (!ids.length) return [] as { id: string; full_name: string | null; email: string | null }[];
      const { data } = await supabase
        .from("profiles").select("id, full_name, email").in("id", ids).order("full_name");
      return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
    },
    staleTime: 60_000,
  });

  const { data: tasks, refetch } = useQuery({
    queryKey: ["mkt-kanban"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,description,priority,due_date,scheduled_post_date,marketing_stage,assignee_id,client_brand,origin_department,requester_id,asset_links,project_id,project:projects(id,code,name),assignee:profiles!tasks_assignee_profile_fkey(id,full_name,email),requester:profiles!tasks_requester_id_fkey(id,full_name)" as any)
        .not("marketing_stage", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as KanbanTask[];
    },
    refetchOnWindowFocus: true,
  });

  // Burn totals per task from task_activity.hours
  const taskIds = useMemo(() => (tasks ?? []).map((t) => t.id), [tasks]);
  const { data: burnMap } = useQuery({
    queryKey: ["mkt-burn", taskIds.join(",")],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_activity" as any)
        .select("task_id, hours")
        .in("task_id", taskIds)
        .not("hours", "is", null);
      if (error) throw error;
      const m = new Map<string, number>();
      (data ?? []).forEach((r: any) => {
        if (r.hours == null) return;
        m.set(r.task_id, (m.get(r.task_id) ?? 0) + Number(r.hours));
      });
      return m;
    },
  });

  const filteredTasks = useMemo(() => {
    if (assigneeFilter === "all") return tasks ?? [];
    if (assigneeFilter === "unassigned") return (tasks ?? []).filter((t) => !t.assignee_id);
    return (tasks ?? []).filter((t) => t.assignee_id === assigneeFilter);
  }, [tasks, assigneeFilter]);

  const byCol = useMemo(() => {
    const m: Record<Stage, KanbanTask[]> = {
      script_writing: [], script_wip: [], design: [], review: [], posting: [], posted: [],
    };
    filteredTasks.forEach((t) => { if (t.marketing_stage) m[t.marketing_stage].push(t); });
    return m;
  }, [filteredTasks]);

  const [pending, setPending] = useState<{ task: KanbanTask; toStage: Stage } | null>(null);
  const [markDone, setMarkDone] = useState<KanbanTask | null>(null);
  const [sendBack, setSendBack] = useState<KanbanTask | null>(null);
  const [dragging, setDragging] = useState<KanbanTask | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragStart(e: DragStartEvent) {
    if (!isMarketingMember) return;
    const t = (tasks ?? []).find((x) => x.id === e.active.id);
    if (t) setDragging(t);
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!isMarketingMember) return;
    const overId = e.over?.id as Stage | undefined;
    if (!overId) return;
    const t = (tasks ?? []).find((x) => x.id === e.active.id);
    if (!t || t.marketing_stage === overId) return;
    if (overId === "posted") { setMarkDone(t); return; }
    setPending({ task: t, toStage: overId });
  }

  async function commitMove(
    task: KanbanTask,
    toStage: Stage,
    newAssigneeId: string,
    opts: { hours: number; note?: string; kind?: string },
  ) {
    if (!isMarketingMember) { toast.error("Only the Marketing team can move cards."); return; }
    const fromStage = task.marketing_stage;
    const patch: any = { marketing_stage: toStage, assignee_id: newAssigneeId };
    // Map to the generic status so other views stay coherent.
    patch.status = toStage === "posted" ? "done" : toStage === "review" ? "review" : toStage === "script_writing" ? "todo" : "in_progress";
    const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
    if (error) { toast.error(error.message); return; }

    // Activity log with hours
    try {
      await supabase.from("task_activity" as any).insert({
        task_id: task.id,
        actor_id: me!.realId,
        kind: opts.kind ?? "marketing_stage_moved",
        from_value: fromStage,
        to_value: toStage,
        note: opts.note ?? null,
        hours: opts.hours,
      } as any);
    } catch { /* ignore */ }

    if (opts.note && opts.note.trim()) {
      await supabase.from("task_comments").insert({ task_id: task.id, author_id: me!.realId, body: opts.note.trim() });
    }

    // Notify new assignee on reassignment
    if (newAssigneeId && newAssigneeId !== task.assignee_id && newAssigneeId !== me!.realId) {
      await supabase.from("notifications").insert({
        user_id: newAssigneeId, kind: "task_reassigned", task_id: task.id,
        body: `You were assigned "${task.title}" in ${COLUMNS.find((c) => c.key === toStage)?.label}.`,
      });
    }

    // Cross-department final-column notify
    if (toStage === "posted" && task.requester_id && task.requester_id !== me!.realId) {
      await supabase.from("notifications").insert({
        user_id: task.requester_id, kind: "crossover_completed", task_id: task.id,
        body: `Your request "${task.title}" was completed by Marketing.`,
      });
    }

    // Also log these hours to the mover's timesheet for today so project-burn stays honest.
    let tsMsg = "";
    if (opts.hours > 0 && task.project_id) {
      try {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const { data: existing } = await supabase
          .from("attendance_logs")
          .select("id, tasks, approved_at")
          .eq("user_id", me!.realId)
          .eq("date", dateStr)
          .maybeSingle();

        if (existing?.approved_at) {
          tsMsg = " (day already approved — ask your manager to unapprove to log this)";
        } else {
          const entry = {
            project_code: task.project?.code ?? null,
            project_name: task.project?.name ?? task.title,
            task_id: task.id,
            task_title: task.title,
            hours: Number(opts.hours),
            comments: `Kanban: ${fromStage} → ${toStage}${opts.note ? ` — ${opts.note}` : ""}`,
          };
          const prevTasks = Array.isArray(existing?.tasks) ? (existing!.tasks as any[]) : [];
          const nextTasks = [...prevTasks, entry];
          const totalHrs = nextTasks.reduce((s, r) => s + (Number(r.hours) || 0), 0);
          if (existing?.id) {
            await supabase.from("attendance_logs")
              .update({ tasks: nextTasks, total_hours: totalHrs, last_edited_by: me!.realId })
              .eq("id", existing.id);
          } else {
            await supabase.from("attendance_logs")
              .insert({ user_id: me!.realId, date: dateStr, tasks: nextTasks, total_hours: totalHrs, last_edited_by: me!.realId });
          }
        }
      } catch {
        tsMsg = " (couldn't sync to your timesheet)";
      }
    }

    toast.success(`Card moved · ${opts.hours}h logged${tsMsg}`);
    qc.invalidateQueries({ queryKey: ["mkt-kanban"] });
    qc.invalidateQueries({ queryKey: ["mkt-burn"] });
    qc.invalidateQueries({ queryKey: ["my-ts-logs"] });
    qc.invalidateQueries({ queryKey: ["ts-logs"] });
    qc.invalidateQueries({ queryKey: ["pb-logs"] });
    refetch();
  }

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">Marketing Kanban</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Script → Design → Review → Posting → Posted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCrossOpen(true)}>
            <ArrowRightLeft className="h-4 w-4 mr-1" /> Cross-department request
          </Button>
          {canAssignAny && (
            <Button variant="outline" onClick={() => setClientsOpen(true)}>
              <Settings2 className="h-4 w-4 mr-1" /> Clients
            </Button>
          )}
          {isMarketingMember && (
            <Button className="gradient-primary" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New task
            </Button>
          )}
        </div>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-xs text-muted-foreground">Assignee</Label>
        <Select value={assigneeFilter} onValueChange={setAssignee}>
          <SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {(roster ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {me && (roster ?? []).some((u) => u.id === me.realId) && (
          <Button
            size="sm"
            variant={assigneeFilter === me.realId ? "default" : "outline"}
            onClick={() => setAssignee(assigneeFilter === me.realId ? "all" : me.realId)}
          >
            My tasks
          </Button>
        )}
        {assigneeFilter !== "all" && (
          <Button size="sm" variant="ghost" onClick={() => setAssignee("all")}>Clear</Button>
        )}
      </div>

      {!isMarketingMember && me && (
        <MyRequestsStrip meId={me.realId} tasks={tasks ?? []} onOpen={(id) => setOpenTaskId(id)} />
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid gap-3 min-h-[60vh]" style={{ gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(240px, 1fr))` }}>
          {COLUMNS.map((col) => (
            <Column key={col.key} stage={col.key} label={col.label} cards={byCol[col.key]}
              roster={roster ?? []} canAssignAny={canAssignAny} burnMap={burnMap}
              onSendBack={(t) => setSendBack(t)}
              onApprove={(t) => setPending({ task: t, toStage: "posting" })}
              onOpen={(t) => setOpenTaskId(t.id)}
            />
          ))}
        </div>
        <DragOverlay>
          {dragging ? <KanbanCardView task={dragging} dragging /> : null}
        </DragOverlay>
      </DndContext>

      <ReassignDialog
        state={pending} onClose={() => setPending(null)}
        roster={roster ?? []}
        onConfirm={async ({ assigneeId, hours, note }) => {
          if (!pending) return;
          await commitMove(pending.task, pending.toStage, assigneeId, { hours, note });
          setPending(null);
        }}
      />
      <SendBackDialog
        task={sendBack} onClose={() => setSendBack(null)}
        roster={roster ?? []}
        onConfirm={async ({ toStage, assigneeId, note, hours }) => {
          if (!sendBack) return;
          await commitMove(sendBack, toStage, assigneeId, { hours, note, kind: "marketing_stage_sent_back" });
          setSendBack(null);
        }}
      />
      <NewMarketingTaskDialog
        open={newOpen} onClose={() => setNewOpen(false)}
        roster={roster ?? []} me={me}
        onCreated={() => qc.invalidateQueries({ queryKey: ["mkt-kanban"] })}
      />
      <CrossoverDialog
        open={crossOpen} onClose={() => setCrossOpen(false)} me={me}
        onCreated={() => qc.invalidateQueries({ queryKey: ["mkt-kanban"] })}
      />
      <ClientsDialog open={clientsOpen} onClose={() => setClientsOpen(false)} />
      <TaskDetailSheet taskId={openTaskId} onClose={() => { setOpenTaskId(null); qc.invalidateQueries({ queryKey: ["mkt-kanban"] }); }} />
    </div>
  );
}

function Column({ stage, label, cards, roster, canAssignAny, burnMap, onSendBack, onApprove, onOpen }: {
  stage: Stage; label: string; cards: KanbanTask[];
  roster: { id: string; full_name: string | null; email: string | null }[];
  canAssignAny: boolean;
  burnMap?: Map<string, number>;
  onSendBack: (t: KanbanTask) => void;
  onApprove: (t: KanbanTask) => void;
  onOpen: (t: KanbanTask) => void;
}) {
  void roster; void canAssignAny;
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div ref={setNodeRef}
      className={`flex flex-col rounded-lg border ${isOver ? "border-primary bg-primary/5" : "border-border/60 bg-surface/40"} p-2`}>
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <Badge variant="outline" className="text-[10px]">{cards.length}</Badge>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto max-h-[70vh] pr-1">
        {cards.map((t) => (
          <DraggableCard key={t.id} task={t} onOpen={() => onOpen(t)}>
            <KanbanCardView task={t} burnHours={burnMap?.get(t.id)} />
            {stage === "review" && (
              <div className="mt-2 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
                  onClick={(e) => { e.stopPropagation(); onApprove(t); }}>
                  <Check className="h-3 w-3 mr-1" /> Approve
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
                  onClick={(e) => { e.stopPropagation(); onSendBack(t); }}>
                  <Undo2 className="h-3 w-3 mr-1" /> Send back
                </Button>
              </div>
            )}
          </DraggableCard>
        ))}
        {cards.length === 0 && <div className="text-xs text-muted-foreground px-1 py-4 text-center">Drop here</div>}
      </div>
    </div>
  );
}

function DraggableCard({ task, children, onOpen }: { task: KanbanTask; children: React.ReactNode; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      onClick={onOpen}
      className={`rounded-md border border-border/60 bg-card p-2 shadow-sm ${isDragging ? "opacity-40" : ""} cursor-grab active:cursor-grabbing`}>
      {children}
    </div>
  );
}

function KanbanCardView({ task, dragging, burnHours }: { task: KanbanTask; dragging?: boolean; burnHours?: number }) {
  const internalOverdue = task.due_date && task.marketing_stage !== "posted" && isPast(parseISO(task.due_date));
  return (
    <div className={dragging ? "rounded-md border border-primary bg-card p-2 shadow-lg" : ""}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-tight">{task.title}</div>
          {task.description && <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{task.description}</div>}
        </div>
        <Avatar className="h-6 w-6 shrink-0" title={task.assignee?.full_name ?? task.assignee?.email ?? "Unassigned"}>
          <AvatarFallback className="text-[10px] bg-primary/20">{initialsOf(task.assignee?.full_name, task.assignee?.email)}</AvatarFallback>
        </Avatar>
      </div>
      <div className="flex flex-wrap items-center gap-1 mt-2">
        <Badge variant="outline" className="capitalize text-[10px] h-5">{task.priority}</Badge>
        {burnHours != null && burnHours > 0 && (
          <Badge variant="outline" className="text-[10px] h-5 gap-1">
            <Clock className="h-2.5 w-2.5" />{burnHours}h
          </Badge>
        )}
        {task.client_brand && <Badge variant="secondary" className="text-[10px] h-5">{task.client_brand}</Badge>}
        {task.origin_department && (
          <Badge className="text-[10px] h-5 bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30" variant="outline">
            <Send className="h-2.5 w-2.5 mr-1" />
            From {task.origin_department}{task.requester?.full_name ? ` · ${task.requester.full_name}` : ""}
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] text-muted-foreground">
        {task.due_date && (
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 border ${internalOverdue ? "border-destructive text-destructive" : "border-border/60"}`}>
            {internalOverdue && <AlertTriangle className="h-3 w-3" />}
            Deadline {format(parseISO(task.due_date), "MMM d")}
          </span>
        )}
        {task.scheduled_post_date && (
          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 border border-border/60">
            Post {format(parseISO(task.scheduled_post_date), "MMM d")}
          </span>
        )}
        {(task.asset_links ?? []).slice(0, 2).map((l, i) => (
          <a key={i} href={l.url} target="_blank" rel="noreferrer"
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-primary hover:underline">
            <ExternalLink className="h-2.5 w-2.5" />{l.label || "link"}
          </a>
        ))}
      </div>
    </div>
  );
}

function ReassignDialog({ state, onClose, roster, onConfirm }: {
  state: { task: KanbanTask; toStage: Stage } | null;
  onClose: () => void;
  roster: { id: string; full_name: string | null; email: string | null }[];
  onConfirm: (v: { assigneeId: string; hours: number; note?: string }) => void;
}) {
  const [aid, setAid] = useState<string>("");
  const [hours, setHours] = useState<string>("");
  const [note, setNote] = useState<string>("");
  useEffect(() => {
    setAid(state?.task.assignee_id ?? "");
    setHours(""); setNote("");
  }, [state]);
  const label = state ? COLUMNS.find((c) => c.key === state.toStage)?.label : "";
  const hoursNum = Number(hours);
  const valid = !!aid && hours !== "" && !Number.isNaN(hoursNum) && hoursNum >= 0;
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Move to {label}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Assign to</Label>
            <Select value={aid} onValueChange={setAid}>
              <SelectTrigger><SelectValue placeholder="Pick teammate" /></SelectTrigger>
              <SelectContent>
                {roster.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Hours spent on this stage</Label>
            <Input type="number" min={0} step={0.25} value={hours}
              onChange={(e) => setHours(e.target.value)} placeholder="e.g. 1.5" />
          </div>
          <div className="space-y-1">
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth logging?" />
          </div>
          <p className="text-xs text-muted-foreground">Every move records hours to keep task burn accurate.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gradient-primary" disabled={!valid}
            onClick={() => onConfirm({ assigneeId: aid, hours: hoursNum, note: note || undefined })}>
            Confirm move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendBackDialog({ task, onClose, roster, onConfirm }: {
  task: KanbanTask | null; onClose: () => void;
  roster: { id: string; full_name: string | null; email: string | null }[];
  onConfirm: (v: { toStage: Stage; assigneeId: string; note?: string; hours: number }) => void;
}) {
  const [stage, setStage] = useState<Stage>("script_writing");
  const [aid, setAid] = useState<string>("");
  const [note, setNote] = useState("");
  const [hours, setHours] = useState<string>("");
  useEffect(() => {
    setStage("script_writing"); setNote(""); setHours("");
    setAid(task?.assignee_id ?? "");
  }, [task]);
  const hoursNum = Number(hours);
  const valid = !!aid && hours !== "" && !Number.isNaN(hoursNum) && hoursNum >= 0;
  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-display">Send back</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Send back to</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="script_writing">Script Writing</SelectItem>
                <SelectItem value="script_wip">Script Writing – In Progress</SelectItem>
                <SelectItem value="design">Design</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reassign to</Label>
            <Select value={aid} onValueChange={setAid}>
              <SelectTrigger><SelectValue placeholder="Pick teammate" /></SelectTrigger>
              <SelectContent>
                {roster.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Review hours (time you spent reviewing)</Label>
            <Input type="number" min={0} step={0.25} value={hours}
              onChange={(e) => setHours(e.target.value)} placeholder="e.g. 0.5" />
          </div>
          <div className="space-y-1">
            <Label>Comment (optional)</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs changing?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gradient-primary" disabled={!valid}
            onClick={() => onConfirm({ toStage: stage, assigneeId: aid, note, hours: hoursNum })}>
            Send back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewMarketingTaskDialog({ open, onClose, roster, me, onCreated }: {
  open: boolean; onClose: () => void;
  roster: { id: string; full_name: string | null; email: string | null }[];
  me: any; onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState("");
  const [projectId, setProjectId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [postDate, setPostDate] = useState("");
  const [priority, setPriority] = useState<"low"|"medium"|"high">("medium");
  const [client, setClient] = useState<string>("");
  const [clientOther, setClientOther] = useState("");
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [estimatedHours, setEstimatedHours] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: clients } = useQuery({
    queryKey: ["mkt-clients"], enabled: open,
    queryFn: async () => (await supabase.from("marketing_clients" as any).select("id,name").eq("active", true).order("name")).data ?? [],
  });

  const { data: projects } = useQuery({
    queryKey: ["projects-active"], enabled: open,
    queryFn: async () => (await supabase.from("projects").select("id, code, name").eq("status", "active").order("name")).data ?? [],
  });

  const { data: mktDeptId } = useQuery({
    queryKey: ["taxonomy-dept-id", DEPT], enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("taxonomy_departments").select("id").ilike("name", DEPT).maybeSingle();
      return (data as any)?.id ?? null;
    },
  });

  useEffect(() => {
    if (open) {
      setTitle(""); setDesc(""); setAssignee(me?.realId ?? ""); setProjectId(""); setDeadline(""); setPostDate("");
      setPriority("medium"); setClient(""); setClientOther(""); setLinks([]); setEstimatedHours("");
    }
  }, [open, me?.realId]);

  async function submit() {
    if (!title.trim()) return toast.error("Title required");
    if (!assignee) return toast.error("Assignee required");
    if (!projectId) return toast.error("Project required");
    let estHours: number | null = null;
    if (estimatedHours.trim()) {
      const n = Number(estimatedHours);
      if (!Number.isFinite(n) || n <= 0) return toast.error("Estimated hours must be a positive number.");
      estHours = n;
    }
    setSaving(true);
    const brand = client === "__other__" ? clientOther.trim() || null : client || null;
    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: desc.trim() || null,
      priority,
      due_date: deadline || null,
      scheduled_post_date: postDate || null,
      client_brand: brand,
      project_id: projectId,
      marketing_stage: "script_writing",
      status: "todo",
      assignee_id: assignee,
      created_by: me!.realId,
      asset_links: links.filter((l) => l.url.trim()),
      estimated_hours: estHours,
    };
    if (mktDeptId) payload.department_id = mktDeptId;
    const { error } = await supabase.from("tasks").insert(payload as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Task created");
    onCreated();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">New Marketing task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Assign to</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue placeholder="Pick teammate" /></SelectTrigger>
                <SelectContent>
                  {roster.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Internal deadline</Label><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
            <div className="space-y-1"><Label>Scheduled post date</Label><Input type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Estimated hours</Label><Input type="number" min={0} step={0.25} placeholder="e.g. 4" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} /></div>
          <div className="space-y-1"><Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="Pick project" /></SelectTrigger>
              <SelectContent>
                {(projects ?? []).map((p: { id: string; code: string; name: string }) => (
                  <SelectItem key={p.id} value={p.id}><span className="font-mono text-xs mr-2">{p.code}</span>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Client / Brand (optional)</Label>
            <Select value={client} onValueChange={setClient}>
              <SelectTrigger><SelectValue placeholder="Pick client" /></SelectTrigger>
              <SelectContent>
                {(clients as any[] ?? []).map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                <SelectItem value="__other__">Other…</SelectItem>
              </SelectContent>
            </Select>
            {client === "__other__" && (
              <Input className="mt-1" placeholder="Client name" value={clientOther} onChange={(e) => setClientOther(e.target.value)} />
            )}
          </div>
          <div className="space-y-1">
            <Label>Asset links</Label>
            {links.map((l, i) => (
              <div key={i} className="flex gap-1">
                <Input placeholder="Label" value={l.label} onChange={(e) => setLinks((arr) => arr.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x))} />
                <Input placeholder="https://…" value={l.url} onChange={(e) => setLinks((arr) => arr.map((x, ix) => ix === i ? { ...x, url: e.target.value } : x))} />
                <Button variant="ghost" size="sm" onClick={() => setLinks((arr) => arr.filter((_, ix) => ix !== i))}>×</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setLinks((arr) => [...arr, { label: "", url: "" }])}>+ Add link</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gradient-primary" onClick={submit} disabled={saving}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CrossoverDialog({ open, onClose, me, onCreated }: {
  open: boolean; onClose: () => void; me: any; onCreated: () => void;
}) {
  const [myDept, setMyDept] = useState<string>("");
  const [title, setTitle] = useState("");
  const [info, setInfo] = useState("");
  const [deadline, setDeadline] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [references, setReferences] = useState<{ label: string; url: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !me) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("department").eq("id", me.realId).maybeSingle();
      setMyDept(data?.department ?? "");
      setTitle(""); setInfo(""); setDeadline(""); setProjectId(""); setReferences([]);
    })();
  }, [open, me]);

  const { data: projects } = useQuery({
    queryKey: ["projects-active"], enabled: open,
    queryFn: async () => (await supabase.from("projects").select("id, code, name").eq("status", "active").order("name")).data ?? [],
  });

  const { data: mktDeptId } = useQuery({
    queryKey: ["taxonomy-dept-id", DEPT], enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("taxonomy_departments").select("id").ilike("name", DEPT).maybeSingle();
      return (data as any)?.id ?? null;
    },
  });

  // Auto-assign to Kanishka; fall back to Marketing head.
  const { data: autoAssignee } = useQuery({
    queryKey: ["mkt-auto-assignee"], enabled: open,
    queryFn: async () => {
      const { data: k } = await supabase.from("profiles")
        .select("id").ilike("email", "kanishka@colladome.in").maybeSingle();
      if (k?.id) return k.id as string;
      const { data: head } = await supabase.from("department_heads")
        .select("user_id").eq("department", DEPT).limit(1).maybeSingle();
      return (head?.user_id as string | undefined) ?? null;
    },
  });

  async function submit() {
    if (!title.trim()) return toast.error("Title required");
    if (!projectId) return toast.error("Project required");
    if (!me?.realId) return;
    setSaving(true);
    const links = references.filter((l) => l.url.trim());
    const patch: any = {
      title: title.trim(),
      description: info.trim() || null,
      due_date: deadline || null,
      priority: "medium",
      status: "todo",
      created_by: me.realId,
      requester_id: me.realId,
      origin_department: myDept || "Unknown",
      marketing_stage: "script_writing",
      project_id: projectId,
      asset_links: links,
    };
    if (mktDeptId) patch.department_id = mktDeptId;
    if (autoAssignee) patch.assignee_id = autoAssignee;
    const { data: inserted, error } = await supabase.from("tasks").insert(patch).select("id").single();
    if (error) { setSaving(false); return toast.error(error.message); }

    if (autoAssignee && autoAssignee !== me.realId && inserted?.id) {
      await supabase.from("notifications").insert({
        user_id: autoAssignee, kind: "task_assigned", task_id: inserted.id,
        body: `New cross-department request from ${myDept || "another team"}: "${title.trim()}"`,
      });
    }
    setSaving(false);
    toast.success("Request sent to Marketing");
    onCreated();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Request from Marketing</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
            <div><span className="text-muted-foreground">Requesting as:</span>{" "}
              <span className="font-medium">{me?.fullName ?? me?.email ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Department:</span>{" "}
              <span className="font-medium">{myDept || "—"}</span></div>
            <div className="text-muted-foreground">Will be routed to Script Writing{autoAssignee ? " · Kanishka" : ""}.</div>
          </div>
          <div className="space-y-1"><Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you need Marketing to create?" />
          </div>
          <div className="space-y-1"><Label>Information</Label>
            <Textarea rows={4} value={info} onChange={(e) => setInfo(e.target.value)}
              placeholder="Context, goals, audience, tone — anything the writer needs." />
          </div>
          <div className="space-y-1"><Label>Deadline (optional)</Label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-48" />
          </div>
          <div className="space-y-1"><Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="Pick project" /></SelectTrigger>
              <SelectContent>
                {(projects ?? []).map((p: { id: string; code: string; name: string }) => (
                  <SelectItem key={p.id} value={p.id}><span className="font-mono text-xs mr-2">{p.code}</span>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>References</Label>
            {references.map((l, i) => (
              <div key={i} className="flex gap-1">
                <Input placeholder="Label" value={l.label}
                  onChange={(e) => setReferences((arr) => arr.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x))} />
                <Input placeholder="https://…" value={l.url}
                  onChange={(e) => setReferences((arr) => arr.map((x, ix) => ix === i ? { ...x, url: e.target.value } : x))} />
                <Button variant="ghost" size="sm" onClick={() => setReferences((arr) => arr.filter((_, ix) => ix !== i))}>×</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setReferences((arr) => [...arr, { label: "", url: "" }])}>+ Add reference</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gradient-primary" onClick={submit} disabled={saving}>Send request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MyRequestsStrip({ meId, tasks, onOpen }: {
  meId: string; tasks: KanbanTask[]; onOpen: (id: string) => void;
}) {
  const mine = tasks.filter((t) => t.requester_id === meId);
  if (mine.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-surface/40 p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        My marketing requests
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {mine.map((t) => {
          const label = COLUMNS.find((c) => c.key === t.marketing_stage)?.label ?? t.marketing_stage;
          const done = t.marketing_stage === "posted";
          return (
            <button key={t.id} onClick={() => onOpen(t.id)}
              className="text-left min-w-[220px] rounded-md border border-border/60 bg-card p-2 hover:border-primary transition">
              <div className="text-sm font-medium leading-tight truncate">{t.title}</div>
              <div className="mt-1 flex items-center gap-1 flex-wrap">
                <Badge variant={done ? "default" : "outline"} className="text-[10px] h-5">{label}</Badge>
                {t.assignee?.full_name && (
                  <span className="text-[10px] text-muted-foreground truncate">· {t.assignee.full_name}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ClientsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data: rows } = useQuery({
    queryKey: ["mkt-clients-admin"], enabled: open,
    queryFn: async () => (await supabase.from("marketing_clients" as any).select("id,name,active").order("name")).data ?? [],
  });
  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from("marketing_clients" as any).insert({ name: name.trim() });
    if (error) return toast.error(error.message);
    setName("");
    qc.invalidateQueries({ queryKey: ["mkt-clients-admin"] });
    qc.invalidateQueries({ queryKey: ["mkt-clients"] });
  }
  async function toggle(id: string, active: boolean) {
    await supabase.from("marketing_clients" as any).update({ active: !active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["mkt-clients-admin"] });
    qc.invalidateQueries({ queryKey: ["mkt-clients"] });
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-display">Marketing clients</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input placeholder="Add client" value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={add}>Add</Button>
          </div>
          <div className="space-y-1">
            {(rows as any[] ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded border border-border/60 px-2 py-1 text-sm">
                <span className={r.active ? "" : "text-muted-foreground line-through"}>{r.name}</span>
                <Button size="sm" variant="ghost" onClick={() => toggle(r.id, r.active)}>{r.active ? "Disable" : "Enable"}</Button>
              </div>
            ))}
            {(!rows || (rows as any[]).length === 0) && <p className="text-xs text-muted-foreground">No clients yet.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Silence unused import warnings if any tree-shaking quirks.
void Popover; void PopoverContent; void PopoverTrigger; void Card; void CardContent;
