import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Workflow } from "lucide-react";
import { format } from "date-fns";
import {
  DndContext, PointerSensor, useSensor, useSensors, useDroppable, useDraggable,
  DragOverlay, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { toast } from "sonner";
import { reorderKanbanCard, clearManualRank } from "@/lib/tasks-workflow.functions";

type Status = "todo" | "in_progress" | "review" | "done";
const COLUMNS: { key: Status; label: string }[] = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

export type BoardCard = {
  id: string;
  title: string;
  status: Status;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  created_at?: string | null;
  manual_rank: number | null;
  assignee_id: string | null;
  assignee: { id: string; full_name: string | null; email: string | null } | null;
  created_by: string | null;
  creator: { id: string; full_name: string | null; email: string | null } | null;
  project_id: string | null;
  project: { id: string; name: string } | null;
  workflow_instance_id: string | null;
  stage_index: number | null;
  stage_snapshot: { name: string; requires_review: boolean } | null;
  workflow_template: { id: string; name: string; department: string | null } | null;
  workflow_total_stages: number;
};

type SortKey = "manual" | "due_asc" | "due_desc" | "priority" | "created_desc";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "manual", label: "Manual (drag to reorder)" },
  { key: "due_asc", label: "Due date (soonest)" },
  { key: "due_desc", label: "Due date (latest)" },
  { key: "priority", label: "Priority (high → low)" },
  { key: "created_desc", label: "Recently created" },
];
const PRIORITY_RANK: Record<BoardCard["priority"], number> = { high: 0, medium: 1, low: 2 };
const SORT_STORAGE_KEY = "kanban.sort";
const RANK_STEP = 1024;

function secondaryCompare(a: BoardCard, b: BoardCard, key: SortKey): number {
  const dueA = a.due_date ? new Date(a.due_date).getTime() : null;
  const dueB = b.due_date ? new Date(b.due_date).getTime() : null;
  const prA = PRIORITY_RANK[a.priority] ?? 99;
  const prB = PRIORITY_RANK[b.priority] ?? 99;
  const cA = a.created_at ? new Date(a.created_at).getTime() : 0;
  const cB = b.created_at ? new Date(b.created_at).getTime() : 0;
  if (key === "due_asc" || key === "manual") {
    if (dueA === null && dueB === null) return prA - prB || cB - cA;
    if (dueA === null) return 1;
    if (dueB === null) return -1;
    return (dueA - dueB) || prA - prB || cB - cA;
  }
  if (key === "due_desc") {
    if (dueA === null && dueB === null) return prA - prB || cB - cA;
    if (dueA === null) return 1;
    if (dueB === null) return -1;
    return (dueB - dueA) || prA - prB || cB - cA;
  }
  if (key === "priority") return prA - prB || (dueA ?? Infinity) - (dueB ?? Infinity) || cB - cA;
  return cB - cA;
}

function compareCards(a: BoardCard, b: BoardCard, key: SortKey): number {
  // Manual rank is always primary — a card someone dragged to the top stays on top
  // regardless of the sort mode; unranked cards fall back to the chosen sort.
  const rA = a.manual_rank;
  const rB = b.manual_rank;
  if (rA != null && rB != null) return rA - rB;
  if (rA != null) return -1;
  if (rB != null) return 1;
  return secondaryCompare(a, b, key);
}

export function BoardKanban({
  queryKey, fetcher, canMoveTask, currentUserId,
}: {
  queryKey: unknown[];
  fetcher: () => Promise<BoardCard[]>;
  canMoveTask: (t: BoardCard) => boolean;
  currentUserId: string;
}) {
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [openAction, setOpenAction] = useState<"mark-done" | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    if (typeof window === "undefined") return "manual";
    const stored = window.localStorage.getItem(SORT_STORAGE_KEY) as SortKey | null;
    return stored && SORT_OPTIONS.some((o) => o.key === stored) ? stored : "manual";
  });
  function updateSort(next: SortKey) {
    setSortKey(next);
    try { window.localStorage.setItem(SORT_STORAGE_KEY, next); } catch { /* noop */ }
  }
  const { data: tasks } = useQuery({ queryKey, queryFn: fetcher });

  const reorderFn = useServerFn(reorderKanbanCard);
  const clearRankFn = useServerFn(clearManualRank);

  const byCol = useMemo(() => {
    const map: Record<Status, BoardCard[]> = { todo: [], in_progress: [], review: [], done: [] };
    for (const t of tasks ?? []) map[t.status].push(t);
    for (const k of Object.keys(map) as Status[]) map[k].sort((a, b) => compareCards(a, b, sortKey));
    return map;
  }, [tasks, sortKey]);

  const activeCard = useMemo(
    () => (activeId ? (tasks ?? []).find((t) => t.id === activeId) ?? null : null),
    [activeId, tasks],
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  /** Compute a manual_rank that positions the card between its new neighbors.
   *  `overList` is the destination column's cards in current display order,
   *  excluding the dragged card. `insertBeforeIdx` is where to insert (0..len). */
  function computeNewRank(overList: BoardCard[], insertBeforeIdx: number): number {
    const before = insertBeforeIdx > 0 ? overList[insertBeforeIdx - 1] : null;
    const after = insertBeforeIdx < overList.length ? overList[insertBeforeIdx] : null;
    const beforeRank = before?.manual_rank;
    const afterRank = after?.manual_rank;
    if (beforeRank == null && afterRank == null) return 0;
    if (beforeRank == null && afterRank != null) return afterRank - RANK_STEP;
    if (afterRank == null && beforeRank != null) return beforeRank + RANK_STEP;
    return ((beforeRank as number) + (afterRank as number)) / 2;
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    const card = (tasks ?? []).find((t) => t.id === e.active.id);
    if (!card) return;
    if (!canMoveTask(card)) return toast.error("You can't move this card.");

    // Parse the drop target: "col:<status>" (append) or "slot:<status>:<idx>" (insert before idx).
    let destStatus: Status;
    let insertIdx: number | null = null;
    if (overId.startsWith("slot:")) {
      const [, s, i] = overId.split(":");
      destStatus = s as Status;
      insertIdx = Number(i);
    } else if (overId.startsWith("col:")) {
      destStatus = overId.slice(4) as Status;
    } else {
      return;
    }

    const statusChanged = card.status !== destStatus;

    // Workflow status transitions still route through the detail sheet.
    if (statusChanged && (destStatus === "review" || destStatus === "done") && card.workflow_instance_id) {
      setOpenAction(null);
      setOpenTaskId(card.id);
      toast.info("Close this stage from the task detail panel.");
      return;
    }
    if (statusChanged && destStatus === "done" && card.assignee_id === currentUserId) {
      setOpenAction("mark-done");
      setOpenTaskId(card.id);
      return;
    }

    // Compute the new manual_rank for the drop position within the destination column.
    const destList = byCol[destStatus].filter((c) => c.id !== card.id);
    const targetIdx = insertIdx == null ? destList.length : Math.max(0, Math.min(destList.length, insertIdx));
    const newRank = computeNewRank(destList, targetIdx);

    // Optimistic update.
    qc.setQueryData<BoardCard[] | undefined>(queryKey, (prev) =>
      prev?.map((t) => t.id === card.id
        ? { ...t, manual_rank: newRank, status: statusChanged ? destStatus : t.status }
        : t)
    );

    try {
      await reorderFn({ data: {
        taskId: card.id,
        manualRank: newRank,
        ...(statusChanged ? { status: destStatus } : {}),
      }});
    } catch (err) {
      toast.error((err as Error).message);
      qc.invalidateQueries({ queryKey });
    }
  }

  async function handleClearManual() {
    const ids = (tasks ?? []).filter((t) => t.manual_rank != null).map((t) => t.id);
    if (!ids.length) return toast.info("No manual order to clear.");
    try {
      const res = await clearRankFn({ data: { taskIds: ids } }) as { cleared: number };
      toast.success(`Cleared manual order on ${res.cleared} task${res.cleared === 1 ? "" : "s"}.`);
      qc.invalidateQueries({ queryKey });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2 mb-2">
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleClearManual}>
          Clear manual order
        </Button>
        <label className="text-xs text-muted-foreground">Sort</label>
        <select
          value={sortKey}
          onChange={(e) => updateSort(e.target.value as SortKey)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(240px, 1fr))` }}>
          {COLUMNS.map((c) => (
            <Column key={c.key} col={c} cards={byCol[c.key]} onOpen={(id) => setOpenTaskId(id)} currentUserId={currentUserId} activeId={activeId} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeCard ? (
            <div className="rotate-2 shadow-2xl ring-2 ring-primary/40 rounded-lg">
              <CardPreview card={activeCard} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <TaskDetailSheet taskId={openTaskId} initialAction={openAction} onClose={(next) => { setOpenTaskId(next ?? null); setOpenAction(null); qc.invalidateQueries({ queryKey }); }} />
    </>
  );
}

function Column({ col, cards, onOpen, currentUserId, activeId }: {
  col: { key: Status; label: string };
  cards: BoardCard[];
  onOpen: (id: string) => void;
  currentUserId: string;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.key}` });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 p-2 space-y-1 min-h-[400px] transition-colors ${
        isOver
          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
          : "border-border/60 bg-muted/20"
      }`}
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{col.label}</span>
        <span className="text-xs text-muted-foreground">{cards.length}</span>
      </div>
      {cards.map((c, i) => (
        <div key={c.id} className="space-y-1">
          <DropSlot id={`slot:${col.key}:${i}`} active={!!activeId && activeId !== c.id} />
          <CardItem card={c} onOpen={onOpen} currentUserId={currentUserId} />
        </div>
      ))}
      <DropSlot id={`slot:${col.key}:${cards.length}`} active={!!activeId} trailing />
    </div>
  );
}

function DropSlot({ id, active, trailing = false }: { id: string; active: boolean; trailing?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  if (!active) return null;
  return (
    <div
      ref={setNodeRef}
      className={`transition-all rounded-md ${
        isOver ? "h-8 bg-primary/20 border-2 border-dashed border-primary/60" : trailing ? "h-4" : "h-2"
      }`}
    />
  );
}

function CardBody({ card }: { card: BoardCard }) {
  return (
    <>
      <div className="text-sm font-medium">{card.title}</div>
      <div className="flex flex-wrap gap-1 mt-2 items-center">
        <Badge variant="outline" className="capitalize text-[10px]">{card.priority}</Badge>
        {card.due_date && <span className="text-[10px] text-muted-foreground">Due {format(new Date(card.due_date), "MMM d")}</span>}
        {card.workflow_template && card.stage_snapshot && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Workflow className="h-3 w-3" />
            {card.workflow_template.name} — Stage {card.stage_index} of {card.workflow_total_stages}
          </Badge>
        )}
      </div>
      {card.assignee && (
        <div className="text-[11px] text-muted-foreground mt-1">
          {card.assignee.full_name ?? card.assignee.email}
        </div>
      )}
      {card.creator && (
        <div className="text-[10px] text-muted-foreground/80 mt-0.5">
          Assigned by {(card.creator.full_name ?? card.creator.email ?? "").split(" ")[0] || "—"}
        </div>
      )}
    </>
  );
}

function CardItem({ card, onOpen }: { card: BoardCard; onOpen: (id: string) => void; currentUserId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <Card
      ref={setNodeRef}
      {...attributes} {...listeners}
      onDoubleClick={() => onOpen(card.id)}
      className={`p-3 cursor-grab active:cursor-grabbing select-none hover:border-primary/50 ${isDragging ? "opacity-30 border-dashed" : ""}`}
    >
      <CardBody card={card} />
    </Card>
  );
}

function CardPreview({ card }: { card: BoardCard }) {
  return (
    <Card className="p-3 select-none bg-background">
      <CardBody card={card} />
    </Card>
  );
}

/** Fetch tasks for a given assignee filter (uid or department). Includes workflow linking. */
export async function fetchBoardCards(filter: { assigneeId?: string; department?: string }): Promise<BoardCard[]> {
  // Materialize today's recurring occurrences (idempotent, safe to call every load).
  try { await supabase.rpc("generate_recurring_task_occurrences" as never); } catch { /* noop */ }
  let q = supabase.from("tasks").select(`
    id, title, status, priority, due_date, created_at, manual_rank, assignee_id, reviewer_id, project_id, created_by,
    workflow_instance_id, stage_index, stage_snapshot,
    assignee:profiles!tasks_assignee_profile_fkey(id, full_name, email, department),
    project:projects(id, name)
  `).eq("is_recurring_template" as never, false as never)
    .order("manual_rank", { ascending: true, nullsFirst: false })
    .order("due_date", { ascending: true, nullsFirst: false });
  if (filter.assigneeId) {
    q = q.or(`assignee_id.eq.${filter.assigneeId},and(reviewer_id.eq.${filter.assigneeId},status.eq.review)`);
  }
  const { data } = await q;
  let rows = ((data ?? []) as unknown as Array<Omit<BoardCard, "workflow_template" | "workflow_total_stages" | "creator"> & { assignee: BoardCard["assignee"] & { department?: string | null } }>);

  // Load creator profiles
  const creatorIds = Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean) as string[]));
  const creatorMap = new Map<string, { id: string; full_name: string | null; email: string | null }>();
  if (creatorIds.length) {
    const { data: creators } = await supabase.from("profiles").select("id, full_name, email").in("id", creatorIds);
    for (const c of (creators ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) creatorMap.set(c.id, c);
  }


  // Load workflow templates for any that reference one
  const wfIds = Array.from(new Set(rows.map((r) => r.workflow_instance_id).filter(Boolean) as string[]));
  const wfMap = new Map<string, { templateId: string; templateName: string; templateDepartment: string | null; totalStages: number }>();
  if (wfIds.length) {
    const { data: insts } = await supabase.from("workflow_instances" as never)
      .select("id, template_id, template:workflow_templates(id, name, department)")
      .in("id", wfIds);
    const templateIds = Array.from(new Set(((insts ?? []) as unknown as Array<{ template_id: string }>).map((i) => i.template_id)));
    const { data: stageCounts } = await supabase.from("workflow_template_stages" as never)
      .select("template_id").in("template_id", templateIds);
    const counts = new Map<string, number>();
    for (const s of ((stageCounts ?? []) as unknown as Array<{ template_id: string }>)) {
      counts.set(s.template_id, (counts.get(s.template_id) ?? 0) + 1);
    }
    for (const i of ((insts ?? []) as unknown as Array<{ id: string; template_id: string; template: { name: string; department: string | null } | null }>)) {
      wfMap.set(i.id, {
        templateId: i.template_id,
        templateName: i.template?.name ?? "Workflow",
        templateDepartment: i.template?.department ?? null,
        totalStages: counts.get(i.template_id) ?? 0,
      });
    }
  }

  if (filter.department) {
    const key = filter.department.toLowerCase();
    rows = rows.filter((r) => {
      const assigneeDept = (r.assignee?.department ?? "").toLowerCase();
      if (assigneeDept === key) return true;
      const wf = r.workflow_instance_id ? wfMap.get(r.workflow_instance_id) : null;
      return (wf?.templateDepartment ?? "").toLowerCase() === key;
    });
  }

  return rows.map((r) => {
    const wf = r.workflow_instance_id ? wfMap.get(r.workflow_instance_id) : null;
    return {
      ...r,
      creator: r.created_by ? creatorMap.get(r.created_by) ?? null : null,
      workflow_template: wf
        ? { id: wf.templateId, name: wf.templateName, department: wf.templateDepartment }
        : null,
      workflow_total_stages: wf?.totalStages ?? 0,
    };
  });
}
