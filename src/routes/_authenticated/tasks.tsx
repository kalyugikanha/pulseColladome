import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Progress } from "@/components/ui/progress";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { TaxonomyPicker, AssetLinksEditor, useTaxonomy, type TaxonomyValue } from "@/components/taxonomy-picker";
import {
  createTaskFull, listUserPresets, bumpUserPreset, listRolePresets,
} from "@/lib/tasks-plus.functions";
import { listAwaitingMyReview, setReviewer as setReviewerFn } from "@/lib/tasks-workflow.functions";

export const Route = createFileRoute("/_authenticated/tasks")({ component: TasksPage });

const STATUS: Array<"todo" | "in_progress" | "done"> = ["todo", "in_progress", "done"];
const STATUS_LABEL: Record<string, string> = { todo: "To Do", in_progress: "In Progress", done: "Done" };

function TasksPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: tax } = useTaxonomy();
  const listPresetsFn = useServerFn(listUserPresets);
  const { data: presets } = useQuery({
    queryKey: ["user-presets"], enabled: !!me,
    queryFn: () => listPresetsFn(),
  });
  const rolePresetsFn = useServerFn(listRolePresets);
  const [department, setDepartment] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      if (!me) return;
      const { data: p } = await supabase.from("profiles").select("department").eq("id", me.id).maybeSingle();
      setDepartment(p?.department ?? null);
    })();
  }, [me]);
  const { data: roleDefaultTypeIds } = useQuery({
    queryKey: ["role-presets", department], enabled: !!department,
    queryFn: () => rolePresetsFn({ data: { roleKey: department! } }),
  });

  const createFn = useServerFn(createTaskFull);
  const bumpFn = useServerFn(bumpUserPreset);

  // form state
  const [tProject, setTProject] = useState("");
  const [tTitle, setTTitle] = useState("");
  const [tDesc, setTDesc] = useState("");
  const [tDue, setTDue] = useState("");
  const [tPri, setTPri] = useState<"low" | "medium" | "high">("medium");
  const [tAssignee, setTAssignee] = useState<string>("");
  const [tax_, setTax] = useState<TaxonomyValue>({ domainId: null, departmentId: null, taskTypeIds: [] });
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    // Prefill from role preset if empty
    if (tax_.taskTypeIds.length === 0 && roleDefaultTypeIds && roleDefaultTypeIds.length > 0) {
      setTax((t) => ({ ...t, taskTypeIds: roleDefaultTypeIds.slice(0, 1) }));
    }
  }, [open, roleDefaultTypeIds, tax_.taskTypeIds.length]);

  const { data: tasks } = useQuery({
    queryKey: ["my-tasks", me?.id], enabled: !!me,
    queryFn: async () => (await supabase
      .from("tasks")
      .select("*, project:projects(id,name,client_name), task_types:task_task_types(task_type:taxonomy_task_types(id,name))")
      .eq("assignee_id", me!.id)
      .order("due_date", { ascending: true, nullsFirst: false })).data ?? [],
  });

  const { data: projects } = useQuery({
    queryKey: ["projects-list"],
    queryFn: async () => (await supabase.from("projects").select("id, name").order("name")).data ?? [],
  });

  const canAssignOthers = !!me && (
    me.isAdmin || me.isSuperAdmin || me.canManageProjects ||
    me.isReportingManager || me.isDepartmentHead
  );
  const unscopedAssignees = !!me && (me.isAdmin || me.isSuperAdmin || me.canManageProjects);

  const { data: assignees } = useQuery({
    queryKey: ["assignable-users", me?.id, unscopedAssignees, me?.directReportIds, me?.headOfDepartments],
    enabled: !!me && canAssignOthers,
    queryFn: async () => {
      const rows: Array<{ id: string; full_name: string | null; department: string | null }> = [];
      const seen = new Set<string>();
      const push = (arr: typeof rows) => arr.forEach((r) => { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); } });

      if (unscopedAssignees) {
        const { data } = await supabase.from("profiles").select("id, full_name, department").order("full_name");
        push((data ?? []) as typeof rows);
      } else {
        const ids = Array.from(new Set([me!.id, ...(me!.directReportIds ?? [])]));
        if (ids.length) {
          const { data } = await supabase.from("profiles").select("id, full_name, department").in("id", ids);
          push((data ?? []) as typeof rows);
        }
        if (me!.isDepartmentHead && me!.headOfDepartments.length) {
          const { data } = await supabase.from("profiles").select("id, full_name, department").in("department", me!.headOfDepartments);
          push((data ?? []) as typeof rows);
        }
      }
      rows.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
      return rows;
    },
  });

  useEffect(() => { if (me && !tAssignee) setTAssignee(me.id); }, [me, tAssignee]);


  const presetChips = useMemo(() => {
    if (!presets || !tax) return [];
    return presets.map((p) => {
      const d = tax.domains.find((x) => x.id === p.domain_id);
      const dep = tax.departments.find((x) => x.id === p.department_id);
      const tt = tax.taskTypes.find((x) => x.id === p.task_type_id);
      return { id: p.id, label: [d?.name, dep?.name, tt?.name].filter(Boolean).join(" · "), preset: p };
    }).filter((x) => x.label);
  }, [presets, tax]);

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("tasks").update({ status: status as "todo"|"in_progress"|"done" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Task updated");
    qc.invalidateQueries();
  }

  function resetForm() {
    setTProject(""); setTTitle(""); setTDesc(""); setTDue(""); setTPri("medium");
    setTAssignee(me?.id ?? "");
    setTax({ domainId: null, departmentId: null, taskTypeIds: [] }); setLinks([]);
  }

  async function submit() {
    if (!tTitle.trim()) return toast.error("Title required");
    if (!tProject) return toast.error("Project required");
    const assigneeId = tAssignee || me!.id;
    try {
      await createFn({ data: {
        projectId: tProject, title: tTitle.trim(), description: tDesc.trim(),
        dueDate: tDue || null, priority: tPri, assigneeId,
        assetLinks: links.filter((l) => l.url.trim()),
        domainId: tax_.domainId, departmentId: tax_.departmentId, taskTypeIds: tax_.taskTypeIds,
      }});
      // bump preset
      await bumpFn({ data: { domainId: tax_.domainId, departmentId: tax_.departmentId, taskTypeId: tax_.taskTypeIds[0] ?? null } });
      toast.success("Task created");
      resetForm();
      setOpen(false);
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); }
  }

  const grouped: Record<string, typeof tasks> = {};
  (tasks ?? []).forEach((t) => {
    const key = (t.project as { name?: string } | null)?.name ?? "Unassigned";
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
        <Card><CardContent className="p-10 text-center text-muted-foreground">No tasks yet.</CardContent></Card>
      ) : (
        Object.entries(grouped).map(([project, list]) => (
          <Card key={project}>
            <CardHeader><CardTitle className="font-display text-base">{project}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {list!.map((t) => {
                const types = (t.task_types as { task_type: { id: string; name: string } | null }[] | null)?.map((x) => x.task_type).filter(Boolean) ?? [];
                const linkArr = (t.asset_links as { label: string; url: string }[] | null) ?? [];
                return (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{t.title}</span>
                        <Badge variant="outline" className="capitalize">{t.priority}</Badge>
                        {types.map((tt) => <Badge key={tt!.id} variant="secondary">{tt!.name}</Badge>)}
                      </div>
                      {t.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</div>}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {t.due_date && <span className="text-xs text-muted-foreground">Due {format(new Date(t.due_date), "MMM d, yyyy")}</span>}
                        {linkArr.map((l, i) => (
                          <a key={i} href={l.url} target="_blank" rel="noreferrer"
                            className="text-xs inline-flex items-center gap-1 text-primary hover:underline">
                            <ExternalLink className="h-3 w-3" />{l.label || new URL(l.url).hostname}
                          </a>
                        ))}
                      </div>
                    </div>
                    <Select value={t.status} onValueChange={(v) => updateStatus(t.id, v)}>
                      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUS.map((s) => (<SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">New task</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {presetChips.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Quick presets</Label>
                <div className="flex flex-wrap gap-1">
                  {presetChips.map((c) => (
                    <button key={c.id} type="button" onClick={() =>
                      setTax({ domainId: c.preset.domain_id, departmentId: c.preset.department_id, taskTypeIds: c.preset.task_type_id ? [c.preset.task_type_id] : [] })
                    } className="text-xs rounded-full border border-border px-3 py-1 hover:bg-accent">{c.label}</button>
                  ))}
                </div>
              </div>
            )}

            {canAssignOthers && (
              <div className="space-y-1">
                <Label>Assign to</Label>
                <Select value={tAssignee} onValueChange={setTAssignee}>
                  <SelectTrigger><SelectValue placeholder="Select a teammate" /></SelectTrigger>
                  <SelectContent>
                    {(assignees ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name ?? "Unnamed"}{u.id === me?.id ? " (me)" : ""}
                        {u.department ? ` · ${u.department}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">You can assign to yourself, your direct reports, and members of departments you head.</p>
              </div>
            )}

            <div className="space-y-1">
              <Label>Project</Label>
              <Select value={tProject} onValueChange={setTProject}>
                <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                <SelectContent>{projects?.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
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

            <TaxonomyPicker value={tax_} onChange={setTax} />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Due date</Label>
                <Input type="date" value={tDue} onChange={(e) => setTDue(e.target.value)} /></div>
              <div className="space-y-1"><Label>Priority</Label>
                <Select value={tPri} onValueChange={(v) => setTPri(v as "low" | "medium" | "high")}>
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
          </div>
          <DialogFooter>
            <Button onClick={submit} className="gradient-primary">Create task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
