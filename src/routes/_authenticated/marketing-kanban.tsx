import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Plus, Send, Check, Undo2, AlertTriangle, ExternalLink, ArrowRightLeft, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { format, isPast, parseISO } from "date-fns";
import {
  DndContext, PointerSensor, useSensor, useSensors, useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent, DragOverlay,
} from "@dnd-kit/core";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";

export const Route = createFileRoute("/_authenticated/marketing-kanban")({
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
  const [newOpen, setNewOpen] = useState(false);
  const [crossOpen, setCrossOpen] = useState(false);
  const [clientsOpen, setClientsOpen] = useState(false);

  const isMarketingHead = !!me?.headOfDepartments.some((d) => d.toLowerCase() === "marketing");
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
        .select("id,title,description,priority,due_date,scheduled_post_date,marketing_stage,assignee_id,client_brand,origin_department,requester_id,asset_links,assignee:profiles!tasks_assignee_profile_fkey(id,full_name,email),requester:profiles!tasks_requester_id_fkey(id,full_name)" as any)
        .not("marketing_stage", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as KanbanTask[];
    },
    refetchOnWindowFocus: true,
  });

  const byCol = useMemo(() => {
    const m: Record<Stage, KanbanTask[]> = {
      script_writing: [], script_wip: [], design: [], review: [], posting: [], posted: [],
    };
    (tasks ?? []).forEach((t) => { if (t.marketing_stage) m[t.marketing_stage].push(t); });
    return m;
  }, [tasks]);

  const [pending, setPending] = useState<{ task: KanbanTask; toStage: Stage } | null>(null);
  const [sendBack, setSendBack] = useState<KanbanTask | null>(null);
  const [dragging, setDragging] = useState<KanbanTask | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragStart(e: DragStartEvent) {
    const t = (tasks ?? []).find((x) => x.id === e.active.id);
    if (t) setDragging(t);
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const overId = e.over?.id as Stage | undefined;
    if (!overId) return;
    const t = (tasks ?? []).find((x) => x.id === e.active.id);
    if (!t || t.marketing_stage === overId) return;
    // Posted is terminal
    if (t.marketing_stage === "posted") { toast.error("Posted cards are locked."); return; }
    // Review column exit must use Approve / Send Back buttons
    if (t.marketing_stage === "review" && overId !== "review") {
      toast.error("Use Approve or Send Back on Review cards.");
      return;
    }
    setPending({ task: t, toStage: overId });
  }

  async function commitMove(task: KanbanTask, toStage: Stage, newAssigneeId: string, note?: string) {
    const fromStage = task.marketing_stage;
    const patch: any = { marketing_stage: toStage, assignee_id: newAssigneeId };
    // Map to the generic status so other views stay coherent.
    patch.status = toStage === "posted" ? "done" : toStage === "review" ? "review" : toStage === "script_writing" ? "todo" : "in_progress";
    const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
    if (error) { toast.error(error.message); return; }

    // Activity log (best-effort)
    try {
      await supabase.from("task_activity" as any).insert({
        task_id: task.id,
        actor_id: me!.realId,
        kind: "marketing_stage_moved",
        payload: { from: fromStage, to: toStage, from_assignee: task.assignee_id, to_assignee: newAssigneeId, note: note ?? null },
      } as any);
    } catch { /* ignore */ }

    if (note && note.trim()) {
      await supabase.from("task_comments").insert({ task_id: task.id, author_id: me!.realId, body: note.trim() });
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

    toast.success("Card moved");
    qc.invalidateQueries({ queryKey: ["mkt-kanban"] });
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
          <Button className="gradient-primary" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New task
          </Button>
        </div>
      </header>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid gap-3 min-h-[60vh]" style={{ gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(240px, 1fr))` }}>
          {COLUMNS.map((col) => (
            <Column key={col.key} stage={col.key} label={col.label} cards={byCol[col.key]}
              roster={roster ?? []} canAssignAny={canAssignAny}
              onSendBack={(t) => setSendBack(t)}
              onApprove={(t) => setPending({ task: t, toStage: "posting" })}
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
        onConfirm={async (assigneeId) => {
          if (!pending) return;
          await commitMove(pending.task, pending.toStage, assigneeId);
          setPending(null);
        }}
      />
      <SendBackDialog
        task={sendBack} onClose={() => setSendBack(null)}
        roster={roster ?? []}
        onConfirm={async ({ toStage, assigneeId, note }) => {
          if (!sendBack) return;
          await commitMove(sendBack, toStage, assigneeId, note);
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
    </div>
  );
}

function Column({ stage, label, cards, roster, canAssignAny, onSendBack, onApprove }: {
  stage: Stage; label: string; cards: KanbanTask[];
  roster: { id: string; full_name: string | null; email: string | null }[];
  canAssignAny: boolean;
  onSendBack: (t: KanbanTask) => void;
  onApprove: (t: KanbanTask) => void;
}) {
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
          <DraggableCard key={t.id} task={t}>
            <KanbanCardView task={t} />
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

function DraggableCard({ task, children }: { task: KanbanTask; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      className={`rounded-md border border-border/60 bg-card p-2 shadow-sm ${isDragging ? "opacity-40" : ""} cursor-grab active:cursor-grabbing`}>
      {children}
    </div>
  );
}

function KanbanCardView({ task, dragging }: { task: KanbanTask; dragging?: boolean }) {
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
  onConfirm: (assigneeId: string) => void;
}) {
  const [aid, setAid] = useState<string>("");
  useEffect(() => { setAid(state?.task.assignee_id ?? ""); }, [state]);
  const label = state ? COLUMNS.find((c) => c.key === state.toStage)?.label : "";
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Move to {label}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Assign to</Label>
          <Select value={aid} onValueChange={setAid}>
            <SelectTrigger><SelectValue placeholder="Pick teammate" /></SelectTrigger>
            <SelectContent>
              {roster.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Reassignment is prompted every move — keep the same person or change it.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gradient-primary" disabled={!aid} onClick={() => onConfirm(aid)}>Confirm move</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendBackDialog({ task, onClose, roster, onConfirm }: {
  task: KanbanTask | null; onClose: () => void;
  roster: { id: string; full_name: string | null; email: string | null }[];
  onConfirm: (v: { toStage: Stage; assigneeId: string; note?: string }) => void;
}) {
  const [stage, setStage] = useState<Stage>("script_writing");
  const [aid, setAid] = useState<string>("");
  const [note, setNote] = useState("");
  useEffect(() => {
    setStage("script_writing"); setNote("");
    setAid(task?.assignee_id ?? "");
  }, [task]);
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
            <Label>Comment (optional)</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs changing?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gradient-primary" disabled={!aid}
            onClick={() => onConfirm({ toStage: stage, assigneeId: aid, note })}>
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
  const [deadline, setDeadline] = useState("");
  const [postDate, setPostDate] = useState("");
  const [priority, setPriority] = useState<"low"|"medium"|"high">("medium");
  const [client, setClient] = useState<string>("");
  const [clientOther, setClientOther] = useState("");
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: clients } = useQuery({
    queryKey: ["mkt-clients"], enabled: open,
    queryFn: async () => (await supabase.from("marketing_clients" as any).select("id,name").eq("active", true).order("name")).data ?? [],
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
      setTitle(""); setDesc(""); setAssignee(me?.realId ?? ""); setDeadline(""); setPostDate("");
      setPriority("medium"); setClient(""); setClientOther(""); setLinks([]);
    }
  }, [open, me?.realId]);

  async function submit() {
    if (!title.trim()) return toast.error("Title required");
    if (!assignee) return toast.error("Assignee required");
    setSaving(true);
    const brand = client === "__other__" ? clientOther.trim() || null : client || null;
    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: desc.trim() || null,
      priority,
      due_date: deadline || null,
      scheduled_post_date: postDate || null,
      client_brand: brand,
      marketing_stage: "script_writing",
      status: "todo",
      assignee_id: assignee,
      created_by: me!.realId,
      asset_links: links.filter((l) => l.url.trim()),
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
          <div className="space-y-1"><Label>Client / Brand</Label>
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
  const [target, setTarget] = useState<string>(DEPT);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [deadline, setDeadline] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !me) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("department").eq("id", me.realId).maybeSingle();
      setMyDept(data?.department ?? "");
      setTitle(""); setDesc(""); setDeadline(""); setReason(""); setTarget(DEPT);
    })();
  }, [open, me]);

  const { data: depts } = useQuery({
    queryKey: ["taxonomy-departments-list"], enabled: open,
    queryFn: async () => (await supabase.from("taxonomy_departments").select("id,name").order("name")).data ?? [],
  });

  async function submit() {
    if (!title.trim()) return toast.error("Title required");
    if (!target) return toast.error("Target department required");
    setSaving(true);
    const targetDeptId = ((depts ?? []) as Array<{ id: string; name: string }>)
      .find((d) => d.name.toLowerCase() === target.toLowerCase())?.id ?? null;
    const patch: any = {
      title: title.trim(),
      description: desc.trim() || null,
      due_date: deadline || null,
      priority: "medium",
      status: "todo",
      created_by: me!.realId,
      requester_id: me!.realId,
      origin_department: myDept || "Unknown",
    };
    if (targetDeptId) patch.department_id = targetDeptId;
    if (target === DEPT) patch.marketing_stage = "script_writing";
    if (reason.trim()) patch.description = `${patch.description ?? ""}\n\nContext: ${reason.trim()}`.trim();
    const { error } = await supabase.from("tasks").insert(patch);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Request sent");
    onCreated();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-display">Request from another department</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Requesting department</Label>
              <Input value={myDept} onChange={(e) => setMyDept(e.target.value)} placeholder="Your department" />
            </div>
            <div className="space-y-1"><Label>Target department</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEPT}>{DEPT}</SelectItem>
                  {(depts ?? []).map((d: any) => d.name !== DEPT && <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Deadline</Label><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
            <div className="space-y-1"><Label>Reason / context</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
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
