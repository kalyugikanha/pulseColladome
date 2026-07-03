import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

const STATUS: Array<"todo" | "in_progress" | "done"> = ["todo", "in_progress", "done"];
const STATUS_LABEL: Record<string, string> = { todo: "To Do", in_progress: "In Progress", done: "Done" };

function TasksPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const { data: tasks } = useQuery({
    queryKey: ["my-tasks", me?.id],
    enabled: !!me,
    queryFn: async () => (await supabase.from("tasks").select("*, project:projects(id,name,client_name)").eq("assignee_id", me!.id).order("due_date", { ascending: true, nullsFirst: false })).data ?? [],
  });

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("tasks").update({ status: status as any }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Task updated");
    qc.invalidateQueries();
  }

  const grouped: Record<string, any[]> = {};
  (tasks ?? []).forEach((t: any) => {
    const key = t.project?.name ?? "Unassigned";
    (grouped[key] ??= []).push(t);
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">My Tasks</h1>
        <p className="text-muted-foreground text-sm mt-1">Everything assigned to you, grouped by project.</p>
      </header>
      {(tasks?.length ?? 0) === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">No tasks yet. When an admin assigns work to you, it'll appear here.</CardContent></Card>
      ) : (
        Object.entries(grouped).map(([project, list]) => (
          <Card key={project}>
            <CardHeader><CardTitle className="font-display text-base">{project}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {list.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{t.title}</span>
                      <Badge variant="outline" className="capitalize">{t.priority}</Badge>
                    </div>
                    {t.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</div>}
                    {t.due_date && <div className="text-xs text-muted-foreground mt-0.5">Due {format(new Date(t.due_date), "MMM d, yyyy")}</div>}
                  </div>
                  <Select value={t.status} onValueChange={(v) => updateStatus(t.id, v)}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
