import { createFileRoute, useRouterState, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Workflow, LayoutGrid, List as ListIcon, Layers, ListChecks, ChevronsUpDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { BoardKanban, fetchBoardCards, type BoardCard } from "@/components/board/board-kanban";
import { RecurringBadge } from "@/components/tasks/recurring-badge";
import { OverdueBadge, isOverdue } from "@/components/tasks/overdue-badge";
import { createTaskFull, createTasksBulk } from "@/lib/tasks-plus.functions";
import { updateTaskFields } from "@/lib/tasks-workflow.functions";
import { startWorkflow, listWorkflowTemplates } from "@/lib/workflows.functions";
import { TaxonomyPage } from "./admin.taxonomy";

type View = "list" | "kanban";
type Scope = "mine" | "dept" | "all" | "assigned_by_me";

const DEPTS = [
  { value: "Marketing", label: "Marketing" },
  { value: "Business Development", label: "Business Development" },
  { value: "Tech", label: "Tech" },
];

export const Route = createFileRoute("/_authenticated/tasks")({
  validateSearch: (s: Record<string, unknown>): { view?: View; scope?: Scope; dept?: string } => {
    const v = s.view;
    const sc = s.scope;
    return {
      view: v === "list" || v === "kanban" ? v : undefined,
      scope: sc === "mine" || sc === "dept" || sc === "all" || sc === "assigned_by_me" ? sc : undefined,
      dept: typeof s.dept === "string" ? s.dept : undefined,
    };
  },
  component: TasksPage,
});

function TasksPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const search = useRouterState({ select: (s) => s.location.search }) as { view?: View; scope?: Scope; dept?: string };
  const navigate = useNavigate({ from: "/tasks" });

  const [open, setOpen] = useState(false);
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [personFilter, setPersonFilter] = useState<string>("");
  const [personSearch, setPersonSearch] = useState("");

  const { data: allPeople } = useQuery({
    queryKey: ["people-lite-all-tasks"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email, department").order("full_name")).data ?? [],
  });

  if (!me) return <div className="text-muted-foreground">Loading…</div>;

  const isTrainee = me.isTrainee;
  const canDept = !isTrainee && (me.isReportingManager || me.isDepartmentHead || me.isAdmin || me.isSuperAdmin);
  const canAll = !isTrainee && (me.isAdmin || me.isSuperAdmin);
  const canManageTaxonomy = !isTrainee && (me.isSuperAdmin || me.isDepartmentHead || me.isReportingManager);

  const view: View = search.view ?? "kanban";
  const scope: Scope = isTrainee ? "mine" : (search.scope ?? "mine");
  const dept = search.dept ?? DEPTS[0].value;

  const effectiveScope: Scope = isTrainee ? "mine" : (scope === "all" && !canAll ? (canDept ? "dept" : "mine") : scope === "dept" && !canDept ? "mine" : scope);

  const setSearch = (patch: Partial<{ view: View; scope: Scope; dept: string }>) => {
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }), replace: true });
  };

  const fetcherArgs = useMemo(() => {
    if (effectiveScope === "mine") return { assigneeId: me.id };
    if (effectiveScope === "dept") return { department: dept };
    if (effectiveScope === "assigned_by_me") return { createdById: me.id };
    if (effectiveScope === "all" && personFilter) return { assigneeId: personFilter };
    return {};
  }, [effectiveScope, me.id, dept, personFilter]);

  const queryKey = ["tasks-unified", effectiveScope, dept, me.id, personFilter];

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2"><ListChecks className="h-7 w-7 text-primary" /> Tasks</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {effectiveScope === "mine" && "Everything assigned to you."}
            {effectiveScope === "dept" && `All tasks in ${dept}.`}
            {effectiveScope === "all" && "Every task across the org."}
            {effectiveScope === "assigned_by_me" && "Every task you've assigned, across the company."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isTrainee && (
            <Tabs value={effectiveScope} onValueChange={(v) => setSearch({ scope: v as Scope })}>
              <TabsList>
                <TabsTrigger value="mine">Mine</TabsTrigger>
                {canDept && <TabsTrigger value="dept">Department</TabsTrigger>}
                {canAll && <TabsTrigger value="all">All</TabsTrigger>}
                <TabsTrigger value="assigned_by_me">Assigned by me</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {effectiveScope === "dept" && (
            <Select value={dept} onValueChange={(v) => setSearch({ dept: v })}>
              <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPTS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {effectiveScope === "all" && (
            <Select value={personFilter || "__all__"} onValueChange={(v) => setPersonFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-9 w-56"><SelectValue placeholder="All people" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <div className="p-1 sticky top-0 bg-popover z-10">
                  <Input
                    placeholder="Search name, email, department…"
                    value={personSearch}
                    onChange={(e) => setPersonSearch(e.target.value)}
                    className="h-8"
                  />
                </div>
                <SelectItem value="__all__">All people</SelectItem>
                {(allPeople ?? [])
                  .filter((p) => {
                    if (!personSearch.trim()) return true;
                    const q = personSearch.toLowerCase();
                    return (
                      (p.full_name ?? "").toLowerCase().includes(q) ||
                      (p.email ?? "").toLowerCase().includes(q) ||
                      (p.department ?? "").toLowerCase().includes(q)
                    );
                  })
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {(p.full_name ?? p.email)}{p.department ? ` · ${p.department}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          <div className="inline-flex rounded-md border overflow-hidden">
            <Button variant={view === "kanban" ? "default" : "ghost"} size="sm" className="rounded-none h-9" onClick={() => setSearch({ view: "kanban" })}>
              <LayoutGrid className="h-4 w-4 mr-1" /> Kanban
            </Button>
            <Button variant={view === "list" ? "default" : "ghost"} size="sm" className="rounded-none h-9" onClick={() => setSearch({ view: "list" })}>
              <ListIcon className="h-4 w-4 mr-1" /> List
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)} title="Task workflows & templates">
            <Workflow className="h-4 w-4 mr-1" /> Templates
          </Button>
          {canManageTaxonomy && (
            <Button variant="outline" size="sm" onClick={() => setTaxonomyOpen(true)} title="Manage domain / department / task type">
              <Layers className="h-4 w-4 mr-1" /> Taxonomy
            </Button>
          )}
          <Button onClick={() => setOpen(true)} className="gradient-primary"><Plus className="h-4 w-4 mr-1" /> New task</Button>
        </div>
      </header>

      {view === "kanban" ? (
        <BoardKanban
          queryKey={queryKey}
          fetcher={() => fetchBoardCards(fetcherArgs)}
          canMoveTask={(t) => effectiveScope !== "mine" || t.assignee_id === me.id}
          currentUserId={me.id}
        />
      ) : (
        <TasksListView queryKey={queryKey} fetcher={() => fetchBoardCards(fetcherArgs)} />
      )}

      <NewTaskDialog open={open} onClose={() => setOpen(false)} defaultAssigneeId={me.id} defaultDepartment={effectiveScope === "dept" ? dept : null} onCreated={() => qc.invalidateQueries()} />

      <Dialog open={taxonomyOpen} onOpenChange={setTaxonomyOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Layers className="h-5 w-5" /> Manage taxonomy</DialogTitle></DialogHeader>
          <TaxonomyPage />
        </DialogContent>
      </Dialog>

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Workflow className="h-5 w-5" /> Task templates & workflows</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Templates and multi-stage workflows are managed on the Workflows page. Start a task from a template using "Start from a workflow" in the New task dialog.</p>
            <div className="flex gap-2">
              <Button asChild variant="outline" onClick={() => setTemplatesOpen(false)}>
                <Link to="/workflows">Open Workflows</Link>
              </Button>
              <Button onClick={() => { setTemplatesOpen(false); setOpen(true); }} className="gradient-primary">
                <Plus className="h-4 w-4 mr-1" /> New task from template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TasksListView({ queryKey, fetcher }: { queryKey: unknown[]; fetcher: () => Promise<BoardCard[]> }) {
  const { data: cards } = useQuery({ queryKey, queryFn: fetcher });
  if (!cards) return <div className="text-muted-foreground">Loading…</div>;
  if (cards.length === 0) return <Card><CardContent className="p-6 text-sm text-muted-foreground">No tasks match this scope.</CardContent></Card>;

  const grouped: Record<string, BoardCard[]> = { todo: [], in_progress: [], review: [], done: [] };
  for (const c of cards) (grouped[c.status] ??= []).push(c);
  const labels: Record<string, string> = { todo: "To do", in_progress: "In progress", review: "Review", done: "Done" };

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([status, items]) => (
        <Card key={status}>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <div className="text-sm font-semibold">{labels[status] ?? status}</div>
              <Badge variant="outline">{items.length}</Badge>
            </div>
            <div className="divide-y">
              {items.length === 0 && <div className="px-4 py-3 text-xs text-muted-foreground">Nothing here.</div>}
              {items.map((c) => (
                <div key={c.id} className={`px-4 py-2 flex items-center justify-between gap-2 hover:bg-muted/40 ${isOverdue(c) ? "border-l-4 border-l-destructive" : ""}`}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.title}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {c.project?.name ?? "No project"}
                      {c.assignee && ` · ${c.assignee.full_name ?? c.assignee.email}`}
                      {c.due_date && ` · Due ${c.due_date}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <OverdueBadge task={c} />
                    <RecurringBadge task={c} />
                    {c.priority && <Badge variant={c.priority === "high" ? "destructive" : "outline"} className="uppercase text-[10px]">{c.priority}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
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
  const createBulkFn = useServerFn(createTasksBulk);
  const updateFn = useServerFn(updateTaskFields);
  const startWfFn = useServerFn(startWorkflow);
  const listWf = useServerFn(listWorkflowTemplates);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [due, setDue] = useState("");
  const [postDate, setPostDate] = useState("");
  const [estimate, setEstimate] = useState("");
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [pri, setPri] = useState<"low" | "medium" | "high">("medium");
  const [projectId, setProjectId] = useState("");
  const [assignees, setAssignees] = useState<string[]>(defaultAssigneeId ? [defaultAssigneeId] : []);
  const [wfMode, setWfMode] = useState(false);
  const [wfTemplateId, setWfTemplateId] = useState<string>("");
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly">("none");
  const [repeatDays, setRepeatDays] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setAssignee(defaultAssigneeId ?? ""); } }, [open, defaultAssigneeId]);

  const { data: projects } = useQuery({
    queryKey: ["projects-list-lite"],
    queryFn: async () => (await supabase.from("projects").select("id, code, name").order("code")).data as Array<{ id: string; code: string | null; name: string | null }> ?? [],
  });
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const { data: people } = useQuery({
    queryKey: ["assignable-users"],
    queryFn: async () => {
      const { data } = await supabase.rpc("list_assignable_users");
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null; department: string | null }>;
    },
  });
  const filteredPeople = (people ?? []).filter((p) => {
    if (!assigneeFilter.trim()) return true;
    const q = assigneeFilter.toLowerCase();
    return (
      (p.full_name ?? "").toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q) ||
      (p.department ?? "").toLowerCase().includes(q)
    );
  });
  const { data: templates } = useQuery({
    queryKey: ["workflow-templates"], enabled: open,
    queryFn: () => listWf(),
  });

  function toggleDay(d: number) {
    setRepeatDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }

  async function submit() {
    if (!title.trim()) return toast.error("Title required");
    if (!projectId) return toast.error("Project required");
    if (repeat === "weekly" && repeatDays.size === 0) return toast.error("Pick at least one weekday");
    const estNum = estimate.trim() === "" ? null : Number(estimate);
    if (estNum !== null && (!Number.isFinite(estNum) || estNum < 0)) {
      return toast.error("Estimated hours must be a positive number.");
    }
    const cleanLinks = links.filter((l) => l.url.trim());
    setBusy(true);
    try {
      if (wfMode && wfTemplateId) {
        await startWfFn({ data: {
          templateId: wfTemplateId, projectId, title: title.trim(),
          description: desc.trim() || null, dueDate: due || null,
          assigneeId: assignee || null, priority: pri,
        }});
      } else {
        const created = await createFn({ data: {
          projectId, title: title.trim(), description: desc.trim(),
          dueDate: due || null, priority: pri,
          assigneeId: assignee || defaultAssigneeId!, assetLinks: cleanLinks,
          domainId: null, departmentId: null, taskTypeIds: [],
          estimatedHours: estNum,
          recurrence: repeat === "none"
            ? null
            : { freq: repeat, days: repeat === "weekly" ? Array.from(repeatDays).sort() : [] },
        }});
        const newId = (created as unknown as { id?: string } | null)?.id;
        if (newId && repeat === "none" && postDate) {
          await updateFn({ data: { taskId: newId, patch: { scheduled_post_date: postDate } } });
        }
      }
      toast.success(repeat === "none" ? "Task created" : "Recurring task saved");
      setTitle(""); setDesc(""); setDue(""); setPostDate(""); setEstimate(""); setLinks([]);
      setProjectId(""); setWfTemplateId(""); setWfMode(false);
      setRepeat("none"); setRepeatDays(new Set());
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">New task{defaultDepartment ? ` — ${defaultDepartment}` : ""}</DialogTitle></DialogHeader>
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
              <ProjectCombobox projects={projects ?? []} value={projectId} onChange={setProjectId} />
              {projectId && (() => {
                const p = (projects ?? []).find((project) => project.id === projectId);
                return p ? <div className="text-[10px] text-muted-foreground font-mono">Project ID: {p.code ?? p.id}</div> : null;
              })()}
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
              <Label className="text-xs">Scheduled post date</Label>
              <Input type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Assignee</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue placeholder="Pick teammate" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <div className="p-1 sticky top-0 bg-popover z-10">
                    <Input
                      placeholder="Search name, email, department…"
                      value={assigneeFilter}
                      onChange={(e) => setAssigneeFilter(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  {filteredPeople.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {(p.full_name ?? p.email)}{p.department ? ` · ${p.department}` : ""}
                    </SelectItem>
                  ))}
                  {filteredPeople.length === 0 && (
                    <div className="px-2 py-3 text-xs text-muted-foreground">No matches</div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Estimated hours</Label>
              <Input
                type="number" min={0} step={0.25} value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Asset links</Label>
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
          <div className="space-y-1 rounded-md border border-dashed p-2">
            <Label className="text-xs">Repeat</Label>
            <Select value={repeat} onValueChange={(v) => setRepeat(v as "none" | "daily" | "weekly")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly on specific days</SelectItem>
              </SelectContent>
            </Select>
            {repeat === "weekly" && (
              <div className="flex flex-wrap gap-1 pt-1">
                {[
                  { d: 1, l: "Mon" }, { d: 2, l: "Tue" }, { d: 3, l: "Wed" },
                  { d: 4, l: "Thu" }, { d: 5, l: "Fri" }, { d: 6, l: "Sat" }, { d: 7, l: "Sun" },
                ].map(({ d, l }) => (
                  <button
                    key={d} type="button" onClick={() => toggleDay(d)}
                    className={`h-7 px-2 rounded text-xs border ${repeatDays.has(d) ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                  >{l}</button>
                ))}
              </div>
            )}
            {repeat !== "none" && (
              <p className="text-[11px] text-muted-foreground pt-1">
                Occurrences are generated automatically on each matching day. The due date field above is ignored for recurring tasks.
              </p>
            )}
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

type ProjectLite = { id: string; code: string | null; name: string | null };

function ProjectCombobox({ projects, value, onChange }: { projects: ProjectLite[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = projects.find((p) => p.id === value) ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate text-left">
            {selected ? (
              <>
                {selected.code && <span className="font-mono text-xs mr-2">{selected.code}</span>}
                {selected.name ?? "Untitled project"}
              </>
            ) : (
              <span className="text-muted-foreground">Pick project</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by project code or name…" />
          <CommandList>
            <CommandEmpty>No projects found.</CommandEmpty>
            <CommandGroup>
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.code ?? ""} ${p.name ?? ""}`}
                  onSelect={() => { onChange(p.id); setOpen(false); }}
                >
                  <Check className={`h-4 w-4 mr-2 ${value === p.id ? "opacity-100" : "opacity-0"}`} />
                  {p.code && <span className="font-mono text-xs mr-2">{p.code}</span>}
                  <span className="truncate">{p.name ?? "Untitled project"}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
