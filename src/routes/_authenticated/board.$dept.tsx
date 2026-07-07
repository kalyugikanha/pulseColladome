import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { BoardKanban, fetchBoardCards, type BoardCard } from "@/components/board/board-kanban";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { NewTaskDialog } from "./tasks";
import { MultiSelectFilter, UNASSIGNED } from "@/components/multi-select-filter";

const DEPTS: Record<string, string> = {
  marketing: "Marketing",
  "business-development": "Business Development",
  tech: "Tech",
};

export const Route = createFileRoute("/_authenticated/board/$dept")({
  component: BoardPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Unknown board.</div>,
  loader: ({ params }) => {
    if (!DEPTS[params.dept]) throw notFound();
    return { dept: DEPTS[params.dept] };
  },
});

function BoardPage() {
  const { dept } = Route.useLoaderData();
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [projectSel, setProjectSel] = useState<Set<string>>(new Set());
  const [assigneeSel, setAssigneeSel] = useState<Set<string>>(new Set());

  const queryKey = ["dept-board", dept];
  const { data: cards } = useQuery({
    queryKey,
    queryFn: () => fetchBoardCards({ department: dept }),
  });

  const projectOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cards ?? []) if (c.project) m.set(c.project.id, c.project.name);
    return Array.from(m, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [cards]);

  const assigneeOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cards ?? []) if (c.assignee) m.set(c.assignee.id, c.assignee.full_name ?? c.assignee.email ?? "Unknown");
    return Array.from(m, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [cards]);

  const filteredFetcher = async (): Promise<BoardCard[]> => {
    const all = await fetchBoardCards({ department: dept });
    return all.filter((c) => {
      if (projectSel.size > 0 && !(c.project_id && projectSel.has(c.project_id))) return false;
      if (assigneeSel.size > 0) {
        if (c.assignee_id) {
          if (!assigneeSel.has(c.assignee_id)) return false;
        } else {
          if (!assigneeSel.has(UNASSIGNED)) return false;
        }
      }
      return true;
    });
  };

  const filteredKey = ["dept-board", dept, { p: Array.from(projectSel).sort(), a: Array.from(assigneeSel).sort() }];

  if (!me) return <div className="text-muted-foreground">Loading…</div>;
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">{dept} Board</h1>
          <p className="text-muted-foreground text-sm mt-1">All tasks assigned to {dept} team members.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MultiSelectFilter
            label="Project"
            options={projectOptions}
            selected={projectSel}
            onChange={setProjectSel}
          />
          <MultiSelectFilter
            label="Assignee"
            options={assigneeOptions}
            selected={assigneeSel}
            onChange={setAssigneeSel}
            includeUnassigned
          />
          <Button onClick={() => setOpen(true)} className="gradient-primary"><Plus className="h-4 w-4 mr-1" /> New task</Button>
        </div>
      </header>
      <BoardKanban
        queryKey={filteredKey}
        fetcher={filteredFetcher}
        canMoveTask={() => true}
        currentUserId={me.id}
      />
      <NewTaskDialog
        open={open} onClose={() => setOpen(false)}
        defaultAssigneeId={me.id} defaultDepartment={dept}
        onCreated={() => qc.invalidateQueries({ queryKey: ["dept-board", dept] })}
      />
    </div>
  );
}
