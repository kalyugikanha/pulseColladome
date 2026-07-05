import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Play, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TaxonomyPicker, AssetLinksEditor, type TaxonomyValue } from "@/components/taxonomy-picker";
import {
  listTaskTemplates, upsertTaskTemplate, deleteTaskTemplate, generateFromTemplate,
} from "@/lib/tasks-plus.functions";

export const Route = createFileRoute("/_authenticated/task-templates")({ component: Page });

type Recurrence = "none" | "weekly" | "monthly";
type Template = Awaited<ReturnType<typeof listTaskTemplates>>[number];

function Page() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const listFn = useServerFn(listTaskTemplates);
  const upsertFn = useServerFn(upsertTaskTemplate);
  const deleteFn = useServerFn(deleteTaskTemplate);
  const genFn = useServerFn(generateFromTemplate);
  const canView = me?.canManageProjects || me?.isDepartmentHead || me?.isReportingManager || me?.isAdmin;

  const { data: templates } = useQuery({
    queryKey: ["task-templates"], enabled: !!canView,
    queryFn: () => listFn(),
  });
  const { data: projects } = useQuery({
    queryKey: ["projects-list"],
    queryFn: async () => (await supabase.from("projects").select("id, name").order("name")).data ?? [],
  });
  const { data: people } = useQuery({
    queryKey: ["profiles-mini"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, department").order("full_name")).data ?? [],
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("monthly");
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [weekday, setWeekday] = useState<number>(1);
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [active, setActive] = useState(true);
  const [tax, setTax] = useState<TaxonomyValue>({ domainId: null, departmentId: null, taskTypeIds: [] });
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);

  useEffect(() => {
    if (open && editing) {
      setTitle(editing.title);
      setDesc(editing.description ?? "");
      setProjectId(editing.project_id ?? "");
      setAssigneeId(editing.default_assignee_id ?? "");
      setRecurrence(editing.recurrence);
      setDayOfMonth(editing.day_of_month ?? 1);
      setWeekday(editing.weekday ?? 1);
      setPriority(editing.priority);
      setActive(editing.active);
      setTax({
        domainId: editing.domain_id,
        departmentId: editing.department_id,
        taskTypeIds: (editing.task_types as { task_type: { id: string } | null }[] | null)?.map((t) => t.task_type?.id).filter((x): x is string => !!x) ?? [],
      });
      setLinks((editing.asset_links as { label: string; url: string }[] | null) ?? []);
    } else if (!open) {
      setEditing(null); setTitle(""); setDesc(""); setProjectId(""); setAssigneeId("");
      setRecurrence("monthly"); setDayOfMonth(1); setWeekday(1); setPriority("medium"); setActive(true);
      setTax({ domainId: null, departmentId: null, taskTypeIds: [] }); setLinks([]);
    }
  }, [open, editing]);

  async function save() {
    if (!title.trim()) return toast.error("Title required");
    try {
      await upsertFn({ data: {
        id: editing?.id,
        title: title.trim(), description: desc.trim(),
        projectId: projectId || null,
        domainId: tax.domainId, departmentId: tax.departmentId,
        defaultAssigneeId: assigneeId || null,
        assetLinks: links.filter((l) => l.url.trim()),
        recurrence, dayOfMonth: recurrence === "monthly" ? dayOfMonth : null,
        weekday: recurrence === "weekly" ? weekday : null,
        priority, active, taskTypeIds: tax.taskTypeIds,
      }});
      toast.success("Saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["task-templates"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function generate(id: string) {
    const dueDate = new Date().toISOString().slice(0, 10);
    try {
      await genFn({ data: { templateId: id, dueDate } });
      toast.success("Task generated");
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function remove(id: string) {
    if (!confirm("Delete template?")) return;
    await deleteFn({ data: { id } });
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["task-templates"] });
  }

  if (!canView) return <div className="p-8 text-muted-foreground">You don't have access to templates.</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">Task Templates</h1>
          <p className="text-muted-foreground text-sm mt-1">Recurring tasks like content calendars & newsletters.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="gradient-primary">
          <Plus className="h-4 w-4 mr-1" /> New template
        </Button>
      </header>

      <div className="grid gap-3">
        {(templates ?? []).map((t) => (
          <Card key={t.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
              <div>
                <CardTitle className="font-display text-base flex items-center gap-2">
                  {t.title}
                  {!t.active && <Badge variant="outline">inactive</Badge>}
                  <Badge variant="secondary" className="capitalize">{t.recurrence}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {(t.project as { name?: string } | null)?.name ?? "No project"} ·{" "}
                  {(t.assignee as { full_name?: string } | null)?.full_name ?? "No assignee"} ·{" "}
                  {(t.department as { name?: string } | null)?.name ?? "—"}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => generate(t.id)}><Play className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            {t.description && <CardContent className="pt-0 text-sm text-muted-foreground">{t.description}</CardContent>}
          </Card>
        ))}
        {(templates?.length ?? 0) === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">No templates yet.</CardContent></Card>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{editing ? "Edit template" : "New template"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-1"><Label>Description</Label><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>{projects?.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Default assignee</Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger>
                  <SelectContent>{people?.map((p) => (<SelectItem key={p.id} value={p.id}>{p.full_name} {p.department ? `· ${p.department}` : ""}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>
            <TaxonomyPicker value={tax} onChange={setTax} />
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Recurrence</Label>
                <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="none">Manual only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {recurrence === "monthly" && (
                <div className="space-y-1"><Label>Day of month</Label>
                  <Input type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(+e.target.value)} /></div>
              )}
              {recurrence === "weekly" && (
                <div className="space-y-1"><Label>Weekday (1=Mon)</Label>
                  <Input type="number" min={1} max={7} value={weekday} onChange={(e) => setWeekday(+e.target.value)} /></div>
              )}
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
            <AssetLinksEditor value={links} onChange={setLinks} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active
            </label>
          </div>
          <DialogFooter><Button onClick={save} className="gradient-primary">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
