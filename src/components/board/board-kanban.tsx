import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Workflow } from "lucide-react";
import { format } from "date-fns";
import {
  DndContext, PointerSensor, useSensor, useSensors, useDroppable, useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { toast } from "sonner";

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
  assignee_id: string | null;
  assignee: { id: string; full_name: string | null; email: string | null } | null;
  project_id: string | null;
  project: { id: string; name: string } | null;
  workflow_instance_id: string | null;
  stage_index: number | null;
  stage_snapshot: { name: string; requires_review: boolean } | null;
  workflow_template: { id: string; name: string; department: string | null } | null;
  workflow_total_stages: number;
};

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
  const { data: tasks } = useQuery({ queryKey, queryFn: fetcher });

  const byCol = useMemo(() => {
    const map: Record<Status, BoardCard[]> = { todo: [], in_progress: [], review: [], done: [] };
    for (const t of tasks ?? []) map[t.status].push(t);
    return map;
  }, [tasks]);

  async function onDragEnd(e: DragEndEvent) {
    const over = e.over?.id as Status | undefined;
    if (!over) return;
    const card = (tasks ?? []).find((t) => t.id === e.active.id);
    if (!card || card.status === over) return;
    if (!canMoveTask(card)) return toast.error("You can't move this card.");

    // Moving to review/done: if the task belongs to a workflow, open the detail sheet
    // so the user runs the close-task or review flow with required fields.
    if ((over === "review" || over === "done") && card.workflow_instance_id) {
      setOpenTaskId(card.id);
      toast.info("Close this stage from the task detail panel.");
      return;
    }
    // Simple status flip
    const { error } = await supabase.from("tasks").update({ status: over } as never).eq("id", card.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey });
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(240px, 1fr))` }}>
          {COLUMNS.map((c) => (
            <Column key={c.key} col={c} cards={byCol[c.key]} onOpen={(id) => setOpenTaskId(id)} currentUserId={currentUserId} />
          ))}
        </div>
      </DndContext>
      <TaskDetailSheet taskId={openTaskId} onClose={() => { setOpenTaskId(null); qc.invalidateQueries({ queryKey }); }} />
    </>
  );
}

function Column({ col, cards, onOpen, currentUserId }: { col: { key: Status; label: string }; cards: BoardCard[]; onOpen: (id: string) => void; currentUserId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div ref={setNodeRef} className={`rounded-lg border p-2 space-y-2 min-h-[400px] ${isOver ? "border-primary bg-primary/5" : "border-border/60 bg-muted/20"}`}>
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{col.label}</span>
        <span className="text-xs text-muted-foreground">{cards.length}</span>
      </div>
      {cards.map((c) => <CardItem key={c.id} card={c} onOpen={onOpen} currentUserId={currentUserId} />)}
    </div>
  );
}

function CardItem({ card, onOpen }: { card: BoardCard; onOpen: (id: string) => void; currentUserId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <Card
      ref={setNodeRef}
      {...attributes} {...listeners}
      onDoubleClick={() => onOpen(card.id)}
      className={`p-3 cursor-grab active:cursor-grabbing select-none hover:border-primary/50 ${isDragging ? "opacity-50" : ""}`}
    >
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
    </Card>
  );
}

/** Fetch tasks for a given assignee filter (uid or department). Includes workflow linking. */
export async function fetchBoardCards(filter: { assigneeId?: string; department?: string }): Promise<BoardCard[]> {
  let q = supabase.from("tasks").select(`
    id, title, status, priority, due_date, assignee_id, project_id,
    workflow_instance_id, stage_index, stage_snapshot,
    assignee:profiles!tasks_assignee_profile_fkey(id, full_name, email, department),
    project:projects(id, name)
  `).order("due_date", { ascending: true, nullsFirst: false });
  if (filter.assigneeId) q = q.eq("assignee_id", filter.assigneeId);
  const { data } = await q;
  let rows = ((data ?? []) as unknown as Array<Omit<BoardCard, "workflow_template" | "workflow_total_stages"> & { assignee: BoardCard["assignee"] & { department?: string | null } }>);

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
      workflow_template: wf
        ? { id: wf.templateId, name: wf.templateName, department: wf.templateDepartment }
        : null,
      workflow_total_stages: wf?.totalStages ?? 0,
    };
  });
}
