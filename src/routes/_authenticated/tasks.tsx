import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const [tProject, setTProject] = useState("");
  const [tTitle, setTTitle] = useState("");
  const [tDesc, setTDesc] = useState("");
  const [tDue, setTDue] = useState("");
  const [tPri, setTPri] = useState<"low" | "medium" | "high">("medium");

  const { data: tasks } = useQuery({
    queryKey: ["my-tasks", me?.id],
    enabled: !!me,
    queryFn: async () =>
      (
        await supabase
          .from("tasks")
          .select("*, project:projects(id,name,client_name)")
          .eq("assignee_id", me!.id)
          .order("due_date", { ascending: true, nullsFirst: false })
      ).data ?? [],
  });

  const { data: projects } = useQuery({
    queryKey: ["projects-list"],
    queryFn: async () => (await supabase.from("projects").select("id, name").order("name")).data ?? [],
  });

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("tasks").update({ status: status as any }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Task updated");
    qc.invalidateQueries();
  }

  async function createTask() {
    if (!tTitle.trim()) return toast.error("Title required");
    if (!tProject) return toast.error("Project required");
    const { error } = await supabase.from("tasks").insert({
      project_id: tProject,
      title: tTitle.trim(),
      description: tDesc.trim() || null,
      due_date: tDue || null,
      priority: tPri,
      status: "todo",
      assignee_id: me!.id,
      created_by: me!.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Task created");
    setTProject("");
    setTTitle("");
    setTDesc("");
    setTDue("");
    setTPri("medium");
    setOpen(false);
    qc.invalidateQueries();
  }

  const grouped: Record<string, any[]> = {};
  (tasks ?? []).forEach((t: any) => {
    const key = t.project?.name ?? "Unassigned";
    (grouped[key] ??= []).push(t);
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">My Tasks</h1>
          <p className="text-muted-foreground text-sm mt-1">Everything assigned to you, grouped by project.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gradient-primary">
          <Plus className="h-4 w-4 mr-1" /> New task
        </Button>
      </header>

      {(tasks?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No tasks yet. Create your own or wait for an admin to assign work to you.
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([project, list]) => (
          <Card key={project}>
            <CardHeader>
              <CardTitle className="font-display text-base">{project}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {list.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{t.title}</span>
                      <Badge variant="outline" className="capitalize">{t.priority}</Badge>
                    </div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</div>
                    )}
                    {t.due_date && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Due {format(new Date(t.due_date), "MMM d, yyyy")}
                      </div>
                    )}
                  </div>
                  <Select value={t.status} onValueChange={(v) => updateStatus(t.id, v)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">New task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Project</Label>
              <Select value={tProject} onValueChange={setTProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={tTitle} onChange={(e) => setTTitle(e.target.value)} placeholder="What needs to be done?" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={2} value={tDesc} onChange={(e) => setTDesc(e.target.value)} placeholder="Add details..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Due date</Label>
                <Input type="date" value={tDue} onChange={(e) => setTDue(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select value={tPri} onValueChange={(v) => setTPri(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Assignee</Label>
              <Input value="Me" disabled />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createTask} className="gradient-primary">
              Create task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
