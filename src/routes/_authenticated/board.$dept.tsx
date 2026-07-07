import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/use-current-user";
import { BoardKanban, fetchBoardCards } from "@/components/board/board-kanban";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { NewTaskDialog } from "./tasks";

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
  if (!me) return <div className="text-muted-foreground">Loading…</div>;
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">{dept} Board</h1>
          <p className="text-muted-foreground text-sm mt-1">All tasks assigned to {dept} team members.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gradient-primary"><Plus className="h-4 w-4 mr-1" /> New task</Button>
      </header>
      <BoardKanban
        queryKey={["dept-board", dept]}
        fetcher={() => fetchBoardCards({ department: dept })}
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
