import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Workflow } from "lucide-react";
import { toast } from "sonner";
import { BoardKanban, fetchBoardCards } from "@/components/board/board-kanban";
import { createTaskFull } from "@/lib/tasks-plus.functions";
import { startWorkflow, listWorkflowTemplates } from "@/lib/workflows.functions";

export const Route = createFileRoute("/_authenticated/tasks")({ component: TasksPage });

function TasksPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  if (!me) return <div className="text-muted-foreground">Loading…</div>;
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">My Tasks</h1>
          <p className="text-muted-foreground text-sm mt-1">Everything assigned to you.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gradient-primary"><Plus className="h-4 w-4 mr-1" /> New task</Button>
      </header>
      <BoardKanban
        queryKey={["my-tasks-board", me.id]}
        fetcher={() => fetchBoardCards({ assigneeId: me.id })}
        canMoveTask={(t) => t.assignee_id === me.id}
        currentUserId={me.id}
      />
      <NewTaskDialog open={open} onClose={() => setOpen(false)} defaultAssigneeId={me.id} onCreated={() => qc.invalidateQueries()} />
    </div>
  );
}

export function NewTaskDialog({ open, onClose, defaultAssigneeId, defaultDepartment, onCreated }: {
  open: boolean; onClose: () => void;
  defaultAssigneeId?: string | null;
  defaultDepartment?: string | null;
  onCreated?: () => void;
}) {
  const createFn = useServerFn(createTaskFull);
  const startWfFn = useServerFn(startWorkflow);
  const listWf = useServerFn(listWorkflowTemplates);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [due, setDue] = useState("");
  const [pri, setPri] = useState<"low" | "medium" | "high">("medium");
  const [projectId, setProjectId] = useState("");
  const [assignee, setAssignee] = useState<string>(defaultAssigneeId ?? "");
  const [wfMode, setWfMode] = useState(false);
  const [wfTemplateId, setWfTemplateId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setAssignee(defaultAssigneeId ?? ""); } }, [open, defaultAssigneeId]);

  const { data: projects } = useQuery({
    queryKey: ["projects-list-lite"],
    queryFn: async () => (await supabase.from("projects").select("id, name").order("name")).data ?? [],
  });
  const { data: people } = useQuery({
    queryKey: ["people-lite", defaultDepartment],
    queryFn: async () => {
      let q = supabase.from("profiles").select("id, full_name, email, department").order("full_name");
      if (defaultDepartment) q = q.eq("department", defaultDepartment);
      const { data } = await q;
      return data ?? [];
    },
  });
  const { data: templates } = useQuery({
    queryKey: ["workflow-templates"], enabled: open,
    queryFn: () => listWf(),
  });

  async function submit() {
    if (!title.trim()) return toast.error("Title required");
    if (!projectId) return toast.error("Project required");
    setBusy(true);
    try {
      if (wfMode && wfTemplateId) {
        await startWfFn({ data: {
          templateId: wfTemplateId, projectId, title: title.trim(),
          description: desc.trim() || null, dueDate: due || null,
          assigneeId: assignee || null, priority: pri,
        }});
      } else {
        await createFn({ data: {
          projectId, title: title.trim(), description: desc.trim(),
          dueDate: due || null, priority: pri,
          assigneeId: assignee || defaultAssigneeId!, assetLinks: [],
          domainId: null, departmentId: null, taskTypeIds: [],
        }});
      }
      toast.success("Task created");
      setTitle(""); setDesc(""); setDue(""); setProjectId(""); setWfTemplateId(""); setWfMode(false);
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">New task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2 flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            <label className="text-sm flex items-center gap-2 flex-1">
              <input type="checkbox" checked={wfMode} onChange={(e) => setWfMode(e.target.checked)} />
              Start from a workflow
            </label>
          </div>
          {wfMode && (
            <div className="space-y-1">
              <Label className="text-xs">Workflow template</Label>
              <Select value={wfTemplateId} onValueChange={setWfTemplateId}>
                <SelectTrigger><SelectValue placeholder="Pick a template" /></SelectTrigger>
                <SelectContent>
                  {(templates ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.stages.length} stages)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Pick project" /></SelectTrigger>
                <SelectContent>
                  {(projects ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select value={pri} onValueChange={(v) => setPri(v as "low" | "medium" | "high")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Due date</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assignee</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue placeholder="Pick teammate" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {(people ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gradient-primary" onClick={submit} disabled={busy}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
