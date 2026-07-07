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
import { ExternalLink, Plus, Workflow } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { StageEditor } from "@/components/tasks/stage-editor";
import { TaxonomyPicker, AssetLinksEditor, useTaxonomy, type TaxonomyValue } from "@/components/taxonomy-picker";
import {
  createTaskFull, listUserPresets, bumpUserPreset, listRolePresets,
} from "@/lib/tasks-plus.functions";
import { listAwaitingMyReview, setReviewer as setReviewerFn } from "@/lib/tasks-workflow.functions";
import { setTaskStages, type StageInput } from "@/lib/tasks-stages.functions";

export const Route = createFileRoute("/_authenticated/tasks")({ component: TasksPage });

const STATUS: Array<"todo" | "in_progress" | "review" | "done"> = ["todo", "in_progress", "review", "done"];
const STATUS_LABEL: Record<string, string> = { todo: "To Do", in_progress: "In Progress", review: "In Review", done: "Done" };

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
  const [tReviewer, setTReviewer] = useState<string>("");
  const [tEstimate, setTEstimate] = useState<string>("");
  const [tax_, setTax] = useState<TaxonomyValue>({ domainId: null, departmentId: null, taskTypeIds: [] });
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [multiStage, setMultiStage] = useState(false);
  const [stages, setStages] = useState<StageInput[]>([]);
  const [statusFilter, setStatusFilter] = useState<Set<"todo" | "in_progress" | "review" | "done">>(
    () => new Set(["todo", "in_progress", "review"]),
  );

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
      .select("*, project:projects(id,name,client_name), task_types:task_task_types(task_type:taxonomy_task_types(id,name)), current_stage:task_stages!tasks_current_stage_fkey(id,name,kind,status,owner:profiles!task_stages_owner_id_fkey(id,full_name))")
      .or(`assignee_id.eq.${me!.id},reviewer_id.eq.${me!.id}`)
      .order("due_date", { ascending: true, nullsFirst: false })).data ?? [],
  });

  // Sum logged & approved hours per task from the current user's attendance logs (last 120 days).
  const { data: hoursMap } = useQuery({
    queryKey: ["my-tasks-hours", me?.id], enabled: !!me,
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 120);
      const fromStr = from.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("attendance_logs")
        .select("tasks, approved_at")
        .eq("user_id", me!.id)
        .gte("date", fromStr);
      const map = new Map<string, { logged: number; approved: number }>();
      for (const row of data ?? []) {
        const approved = !!(row as { approved_at: string | null }).approved_at;
        const entries = Array.isArray((row as { tasks: unknown }).tasks) ? ((row as { tasks: Array<{ task_id?: string; hours?: number }> }).tasks) : [];
        for (const e of entries) {
          if (!e?.task_id) continue;
          const h = Number(e.hours) || 0;
          if (h <= 0) continue;
          const cur = map.get(e.task_id) ?? { logged: 0, approved: 0 };
          cur.logged += h;
          if (approved) cur.approved += h;
          map.set(e.task_id, cur);
        }
      }
      return map;
    },
  });

  const awaitingFn = useServerFn(listAwaitingMyReview);
  const { data: awaiting } = useQuery({
    queryKey: ["awaiting-my-review", me?.id], enabled: !!me,
    queryFn: () => awaitingFn(),
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
    try {
      const { setTaskStatus } = await import("@/lib/tasks-workflow.functions");
      await setTaskStatus({ data: { taskId: id, status: status as "todo"|"in_progress"|"review"|"done" } });
      toast.success("Task updated");
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); }
  }

  function resetForm() {
    setTProject(""); setTTitle(""); setTDesc(""); setTDue(""); setTPri("medium");
    setTAssignee(me?.id ?? ""); setTReviewer(""); setTEstimate("");
    setTax({ domainId: null, departmentId: null, taskTypeIds: [] }); setLinks([]);
    setMultiStage(false); setStages([]);
  }

  const setReviewerSrv = useServerFn(setReviewerFn);
  const setStagesSrv = useServerFn(setTaskStages);

  async function submit() {
    if (!tTitle.trim()) return toast.error("Title required");
    if (!tProject) return toast.error("Project required");
    if (multiStage) {
      if (stages.length === 0) return toast.error("Add at least one workflow stage.");
      for (const s of stages) {
        if (!s.name.trim() || !s.owner_id) return toast.error("Fill in every stage name and owner.");
      }
    }
    const estHours = tEstimate.trim() === "" ? null : Number(tEstimate);
    if (estHours !== null && (!Number.isFinite(estHours) || estHours < 0)) {
      return toast.error("Estimated hours must be a positive number.");
    }
    const assigneeId = multiStage ? (stages[0].owner_id) : (tAssignee || me!.id);
    try {
      const task = await createFn({ data: {
        projectId: tProject, title: tTitle.trim(), description: tDesc.trim(),
        dueDate: tDue || null, priority: tPri, assigneeId,
        assetLinks: links.filter((l) => l.url.trim()),
        domainId: tax_.domainId, departmentId: tax_.departmentId, taskTypeIds: tax_.taskTypeIds,
        estimatedHours: estHours,
      }});
      if (tReviewer && task?.id && !multiStage) {
        await setReviewerSrv({ data: { taskId: task.id, reviewerId: tReviewer } });
      }
      if (multiStage && task?.id) {
        await setStagesSrv({ data: { taskId: task.id, stages } });
      }
      // bump preset
      await bumpFn({ data: { domainId: tax_.domainId, departmentId: tax_.departmentId, taskTypeId: tax_.taskTypeIds[0] ?? null } });
      toast.success("Task created");
      resetForm();
      setOpen(false);
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); }
  }

  function toggleStatus(s: "todo" | "in_progress" | "review" | "done") {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  const filteredTasks = (tasks ?? []).filter((t) =>
    statusFilter.has((t.status as "todo" | "in_progress" | "review" | "done")),
  );

  const grouped: Record<string, typeof tasks> = {};
  filteredTasks.forEach((t) => {
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Show:</span>
        {STATUS.map((s) => {
          const active = statusFilter.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={`text-xs rounded-full px-3 py-1 border transition ${active ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border hover:bg-accent"}`}
            >
              {STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>

      {(awaiting?.length ?? 0) > 0 && (
        <Card className="border-primary/50">
          <CardHeader><CardTitle className="font-display text-base">Awaiting my review</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {awaiting!.map((t) => (
              <button key={t.id} onClick={() => setOpenTaskId(t.id)}
                className="w-full text-left flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3 hover:bg-primary/10">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {(t.project as { name?: string } | null)?.name} · assignee {(t.assignee as { full_name?: string } | null)?.full_name ?? "—"}
                  </div>
                </div>
                <Badge>Review</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

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
                const pct = (t as { completion_percent?: number }).completion_percent ?? 0;
                const stage = (t as { current_stage?: { name: string; kind: string; status: string; owner: { full_name: string | null } | null } | null }).current_stage;
                return (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3 hover:border-primary/40 cursor-pointer"
                    onClick={() => setOpenTaskId(t.id)}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{t.title}</span>
                        <Badge variant="outline" className="capitalize">{t.priority}</Badge>
                        {types.map((tt) => <Badge key={tt!.id} variant="secondary">{tt!.name}</Badge>)}
                        {stage && (
                          <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-primary">
                            <Workflow className="h-3 w-3" />
                            {stage.name}{stage.owner?.full_name ? ` · ${stage.owner.full_name}` : ""}
                          </Badge>
                        )}
                      </div>
                      {t.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</div>}
                      <div className="flex flex-wrap gap-2 mt-1 items-center">
                        {t.due_date && <span className="text-xs text-muted-foreground">Due {format(new Date(t.due_date), "MMM d, yyyy")}</span>}
                        {linkArr.map((l, i) => (
                          <a key={i} href={l.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                            className="text-xs inline-flex items-center gap-1 text-primary hover:underline">
                            <ExternalLink className="h-3 w-3" />{l.label || new URL(l.url).hostname}
                          </a>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={pct} className="h-1.5 flex-1" />
                        <span className="text-[10px] text-muted-foreground w-9 text-right">{pct}%</span>
                      </div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Select value={t.status} onValueChange={(v) => updateStatus(t.id, v)}>
                        <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUS.map((s) => (<SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}

      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />


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
              <div className="rounded-md border border-border/60 p-3 flex items-start gap-3">
                <Workflow className="h-4 w-4 mt-0.5 text-primary" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Multi-stage workflow</Label>
                    <Switch checked={multiStage} onCheckedChange={setMultiStage} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Route this task through several owners in sequence — with approve / send-back handoffs.
                  </p>
                </div>
              </div>
            )}

            {canAssignOthers && !multiStage && (
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

            {canAssignOthers && !multiStage && (
              <div className="space-y-1">
                <Label>Reviewer (optional)</Label>
                <Select value={tReviewer || "none"} onValueChange={(v) => setTReviewer(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="No reviewer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— No reviewer —</SelectItem>
                    {(assignees ?? []).filter((u) => u.id !== (tAssignee || me?.id)).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name ?? "Unnamed"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">When the assignee marks done, the task moves to review.</p>
              </div>
            )}

            {canAssignOthers && multiStage && (
              <StageEditor
                people={(assignees ?? []).map((u) => ({ id: u.id, full_name: u.full_name, email: null }))}
                value={stages}
                onChange={setStages}
              />
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
