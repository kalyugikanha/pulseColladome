import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { updateTaskFields } from "@/lib/tasks-workflow.functions";
import { useViewAs } from "@/hooks/use-view-as";

type EditableTask = {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  scheduled_post_date: string | null;
  project_id: string | null;
  assignee_id: string | null;
  asset_links: { label: string; url: string }[] | null;
  estimated_hours?: number | null;
};

export function EditTaskDialog({
  open, task, roster, onClose, onSaved,
}: {
  open: boolean;
  task: EditableTask | null;
  roster: { id: string; full_name: string | null; email: string | null }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<"low"|"medium"|"high">("medium");
  const [assignee, setAssignee] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [deadline, setDeadline] = useState<string>("");
  const [postDate, setPostDate] = useState<string>("");
  
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [estimate, setEstimate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: projects } = useQuery({
    queryKey: ["projects-active"], enabled: open,
    queryFn: async () => (await supabase.from("projects").select("id, code, name").eq("status", "active").order("name")).data ?? [],
  });

  useEffect(() => {
    if (!open || !task) return;
    setTitle(task.title ?? "");
    setDesc(task.description ?? "");
    setPriority((task.priority as "low"|"medium"|"high") ?? "medium");
    setAssignee(task.assignee_id ?? "");
    setProjectId(task.project_id ?? "");
    setDeadline(task.due_date ?? "");
    setPostDate(task.scheduled_post_date ?? "");
    
    setLinks(Array.isArray(task.asset_links) ? task.asset_links : []);
    setEstimate(task.estimated_hours == null ? "" : String(task.estimated_hours));
  }, [open, task?.id]);

  const updateFn = useServerFn(updateTaskFields);
  const { viewAsUserId } = useViewAs();

  async function submit() {
    if (!task) return;
    if (!title.trim()) return toast.error("Title required");
    if (!projectId) return toast.error("Project required");
    setSaving(true);
    const estNum = estimate.trim() === "" ? null : Number(estimate);
    if (estNum !== null && (!Number.isFinite(estNum) || estNum < 0)) {
      setSaving(false);
      return toast.error("Estimated hours must be a positive number.");
    }
    try {
      await updateFn({ data: {
        taskId: task.id,
        patch: {
          title: title.trim(),
          description: desc.trim() || null,
          priority,
          due_date: deadline || null,
          scheduled_post_date: postDate || null,
          project_id: projectId,
          assignee_id: assignee || null,
          asset_links: links.filter((l) => l.url.trim()),
          estimated_hours: estNum,
        },
      }});
      toast.success("Task updated");
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Edit task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Assignee</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue placeholder="Pick teammate" /></SelectTrigger>
                <SelectContent>
                  {roster.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as "low"|"medium"|"high")}>
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
            <div className="space-y-1"><Label>Deadline</Label><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
            <div className="space-y-1"><Label>Scheduled post date</Label><Input type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Estimated hours</Label>
            <Input type="number" min={0} step={0.25} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <Label>Asset links</Label>
            {links.map((l, i) => (
              <div key={i} className="flex gap-1">
                <Input placeholder="Label" value={l.label}
                  onChange={(e) => setLinks((arr) => arr.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x))} />
                <Input placeholder="https://…" value={l.url}
                  onChange={(e) => setLinks((arr) => arr.map((x, ix) => ix === i ? { ...x, url: e.target.value } : x))} />
                <Button variant="ghost" size="sm" onClick={() => setLinks((arr) => arr.filter((_, ix) => ix !== i))}>×</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setLinks((arr) => [...arr, { label: "", url: "" }])}>+ Add link</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="gradient-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
