import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Lock, Save, CheckCircle2, Info, MessageSquare, StickyNote, Check, ChevronsUpDown, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { createTaskFull } from "@/lib/tasks-plus.functions";

type Task = {
  project_code?: string;
  project_name?: string;
  task_id?: string;
  task_title?: string;
  hours?: number;
  approved_hours?: number;
  comments?: string;
  approval_note?: string;
};
type Project = { id: string; code: string; name: string };
type UserTask = { id: string; title: string; project_id: string | null; status: string };

export type DayEditorProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  userName: string;
  date: string; // yyyy-mm-dd
  canEdit: boolean;      // may edit while not approved
  canApprove: boolean;   // may toggle approval + edit even when approved
  onSaved?: () => void;
};

export function DayEditorSheet({ open, onOpenChange, userId, userName, date, canEdit, canApprove, onSaved }: DayEditorProps) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Task[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: projects } = useQuery({
    queryKey: ["day-editor-projects"],
    enabled: open,
    queryFn: async () => (await supabase.from("projects").select("id, code, name").order("code")).data as Project[] ?? [],
  });

  const { data: userTasks } = useQuery({
    queryKey: ["day-editor-user-tasks", userId],
    enabled: open && !!userId,
    queryFn: async () => {
      // Only tasks assigned to this person. Hours must be logged against
      // work you actually own — creating a task for someone else does not
      // let you log time against it.
      const { data } = await supabase
        .from("tasks")
        .select("id, title, project_id, status")
        .eq("assignee_id", userId)
        .order("created_at", { ascending: false })
        .limit(500);
      return (data ?? []) as UserTask[];
    },
  });

  const { data: log, refetch } = useQuery({
    queryKey: ["day-editor", userId, date],
    enabled: open && !!userId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_logs")
        .select("id, user_id, date, tasks, total_hours, approved_at, approved_by")
        .eq("user_id", userId)
        .eq("date", date)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!open) return;
    const src = ((log?.tasks as Task[] | null) ?? []).map((t) => ({ ...t }));
    setRows(src);
  }, [log, open]);

  const projectByCode = useMemo(() => new Map((projects ?? []).map((p) => [p.code, p])), [projects]);
  
  const taskById = useMemo(() => new Map((userTasks ?? []).map((t) => [t.id, t])), [userTasks]);
  const isApproved = !!log?.approved_at;
  const locked = isApproved && !canApprove;
  const mayEdit = (canEdit && !isApproved) || canApprove;

  const total = rows.reduce((s, r) => s + (Number(r.hours) || 0), 0);

  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);

  function pickTask(i: number, taskId: string) {
    const t = taskById.get(taskId);
    const proj = t?.project_id ? projectById.get(t.project_id) : undefined;
    setRows((prev) => prev.map((r, idx) => idx === i ? {
      ...r,
      task_id: taskId,
      task_title: t?.title ?? "",
      project_code: proj?.code ?? r.project_code ?? "",
      project_name: proj?.name ?? r.project_name ?? "",
    } : r));
  }

  function updateRow(i: number, patch: Partial<Task>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function deleteRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addRow() {
    setRows((prev) => [...prev, { project_code: "", project_name: "", task_id: "", task_title: "", hours: undefined, comments: "" }]);
  }

  function cleanRows(): Task[] {
    return rows
      .filter((r) => r.task_id && Number(r.hours) > 0)
      .map((r) => ({
        project_code: r.project_code,
        project_name: r.project_name || (r.project_code ? projectByCode.get(r.project_code)?.name : undefined) || r.project_code,
        task_id: r.task_id,
        task_title: r.task_title || (r.task_id ? taskById.get(r.task_id)?.title : undefined),
        hours: Number(r.hours) || 0,
        approved_hours: r.approved_hours != null && !Number.isNaN(Number(r.approved_hours))
          ? Number(r.approved_hours) : undefined,
        comments: r.comments?.trim() || undefined,
        approval_note: r.approval_note?.trim() || undefined,
      }));
  }

  function sumApproved(cleaned: Task[]): number {
    return cleaned.reduce((s, r) => s + (r.approved_hours ?? r.hours ?? 0), 0);
  }

  async function save() {
    setSaving(true);
    try {
      const withHours = rows.filter((r) => Number(r.hours) > 0);
      if (withHours.some((r) => !r.task_id)) {
        toast.error("Every hour must be tied to a task. If the task isn't listed, use the 'Request a task' flow on Punch.");
        setSaving(false);
        return;
      }
      const cleaned = cleanRows();

      const totalHrs = cleaned.reduce((s, r) => s + (r.hours ?? 0), 0);
      const { data: userRes } = await supabase.auth.getUser();
      const myId = userRes.user?.id ?? null;

      const basePayload: Record<string, unknown> = {
        tasks: cleaned,
        total_hours: totalHrs,
        logged_hours: totalHrs,
        last_edited_by: myId,
      };
      if (isApproved) basePayload.approved_hours = sumApproved(cleaned);

      if (log?.id) {
        const { error } = await supabase
          .from("attendance_logs")
          .update(basePayload as never)
          .eq("id", log.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("attendance_logs")
          .insert({ user_id: userId, date, ...basePayload } as never);
        if (error) throw error;
      }
      toast.success("Saved");
      await refetch();
      qc.invalidateQueries({ queryKey: ["ts-logs"] });
      qc.invalidateQueries({ queryKey: ["my-ts-logs"] });
      qc.invalidateQueries({ queryKey: ["pb-logs"] });
      qc.invalidateQueries({ queryKey: ["my-tasks-hours"] });
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleApproval() {
    if (!canApprove) return;
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const myId = userRes.user?.id ?? null;

      if (!log?.id) {
        const withHours = rows.filter((r) => Number(r.hours) > 0);
        if (withHours.some((r) => !r.task_id)) {
          toast.error("Every row with hours needs a task before approval.");
          setSaving(false);
          return;
        }
        const cleaned = cleanRows();
        // Default approved = logged for any row the approver didn't override
        const withApproved = cleaned.map((r) => ({ ...r, approved_hours: r.approved_hours ?? r.hours ?? 0 }));
        const totalHrs = cleaned.reduce((s, r) => s + (r.hours ?? 0), 0);
        const approvedTotal = sumApproved(withApproved);
        const { error } = await supabase.from("attendance_logs").insert({
          user_id: userId, date, tasks: withApproved, total_hours: totalHrs,
          logged_hours: totalHrs, approved_hours: approvedTotal,
          approved_at: new Date().toISOString(), approved_by: myId, last_edited_by: myId,
        } as never);
        if (error) throw error;
      } else if (isApproved) {
        const { error } = await supabase.from("attendance_logs")
          .update({ approved_at: null, approved_by: null, approved_hours: null } as never)
          .eq("id", log.id);
        if (error) throw error;
      } else {
        const cleaned = cleanRows();
        const withApproved = cleaned.map((r) => ({ ...r, approved_hours: r.approved_hours ?? r.hours ?? 0 }));
        const totalHrs = cleaned.reduce((s, r) => s + (r.hours ?? 0), 0);
        const approvedTotal = sumApproved(withApproved);
        const { error } = await supabase.from("attendance_logs").update({
          tasks: withApproved, total_hours: totalHrs, logged_hours: totalHrs,
          approved_hours: approvedTotal,
          approved_at: new Date().toISOString(), approved_by: myId,
        } as never).eq("id", log.id);
        if (error) throw error;
      }
      toast.success(isApproved ? "Unapproved" : "Approved");
      await refetch();
      qc.invalidateQueries({ queryKey: ["ts-logs"] });
      qc.invalidateQueries({ queryKey: ["my-ts-logs"] });
      qc.invalidateQueries({ queryKey: ["my-tasks-hours"] });
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-5xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {userName}
            {isApproved && <Badge variant="secondary" className="gap-1 text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-300"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>}
            {locked && <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Locked</Badge>}
          </SheetTitle>
          <SheetDescription>
            {format(new Date(date + "T00:00:00"), "EEEE, d MMM yyyy")} — {total.toFixed(1)} hrs
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
          <span>You can only log hours against tasks assigned to you. If the task you worked on isn't here, ask your manager to assign it — or use the "Request a task" flow on Punch.</span>
        </div>

        <div className="mt-4 space-y-3">
          <div className="-mx-6 overflow-x-auto sm:mx-0">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Task</TableHead>
                <TableHead className="min-w-[160px]">Project</TableHead>
                <TableHead className="w-[90px] text-right">Hours</TableHead>
                <TableHead className="w-[100px] text-right">Approved</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  <div className="flex flex-col items-center gap-2">
                    <span>No entries for this day.</span>
                    {mayEdit && (
                      <Button variant="outline" size="sm" onClick={addRow}>
                        <Plus className="h-4 w-4 mr-1" /> Add first task
                      </Button>
                    )}
                  </div>
                </TableCell></TableRow>
              )}
              {rows.map((r, i) => {
                const legacyTaskMissing = !!r.task_id && !taskById.has(r.task_id);
                const derivedProject = r.project_code
                  ? `${r.project_code}${r.project_name ? " · " + r.project_name : ""}`
                  : "";
                const loggedH = Number(r.hours) || 0;
                const apprH = r.approved_hours != null && !Number.isNaN(Number(r.approved_hours))
                  ? Number(r.approved_hours) : null;
                const reduced = apprH != null && apprH < loggedH;
                const readOnlyTask = !mayEdit;
                return (
                  <TableRow key={i}>
                    <TableCell>
                      {readOnlyTask ? (
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {r.task_title ?? (r.task_id ? "Task" : <span className="italic text-muted-foreground">Pick a task</span>)}
                          </div>
                          {legacyTaskMissing && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">legacy · no longer assigned</div>
                          )}
                        </div>
                      ) : (
                        <TaskPickerCell
                          value={r.task_id ?? ""}
                          title={r.task_title ?? ""}
                          invalid={!r.task_id && Number(r.hours) > 0}
                          legacyTaskMissing={legacyTaskMissing}
                          tasks={userTasks ?? []}
                          projects={projects ?? []}
                          projectById={projectById}
                          assigneeId={userId}
                          onPick={(id) => pickTask(i, id)}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="h-8 flex items-center text-sm text-muted-foreground truncate">
                        {derivedProject ? (
                          <>
                            <span className="font-mono mr-1">{r.project_code}</span>
                            {r.project_name && <span className="truncate">{r.project_name}</span>}
                          </>
                        ) : <span className="italic">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" min={0} step={0.25}
                        value={r.hours ? String(r.hours) : ""}
                        placeholder="0"
                        onChange={(e) => updateRow(i, { hours: e.target.value === "" ? undefined : Number(e.target.value) })}
                        disabled={!mayEdit}
                        className="h-8 w-20 px-2 text-sm text-right font-mono tabular-nums"
                      />
                    </TableCell>
                    {canApprove ? (
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number" min={0} step={0.25}
                              value={r.approved_hours ? String(r.approved_hours) : ""}
                              placeholder="0"
                              onChange={(e) => {
                                const v = e.target.value;
                                updateRow(i, { approved_hours: v === "" ? undefined : Number(v) });
                              }}
                              className="h-8 w-20 px-2 text-sm text-right font-mono tabular-nums"
                            />
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className={`h-7 w-7 shrink-0 ${r.approval_note?.trim() ? "text-primary" : "text-muted-foreground"}`}
                                  aria-label="Manager note"
                                  title={r.approval_note?.trim() ? "Manager note (click to edit)" : "Add manager note"}
                                >
                                  <StickyNote className="h-3.5 w-3.5" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-80" align="end">
                                <div className="space-y-2">
                                  <div className="text-xs font-medium">Manager note (visible to employee)</div>
                                  <Textarea
                                    value={r.approval_note ?? ""}
                                    onChange={(e) => updateRow(i, { approval_note: e.target.value })}
                                    placeholder={reduced ? "e.g. Adjusted to 1h — task scope estimated at 1h." : "Explain any adjustment or add a review note…"}
                                    rows={4}
                                    className="text-sm"
                                  />
                                  <p className="text-[10px] text-muted-foreground">Saved when you save the day. Distinct from the employee's own comment.</p>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                          {reduced && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-700 border-amber-500/60">
                              Adjusted −{(loggedH - (apprH ?? 0)).toFixed(2)}h
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    ) : (
                      <TableCell className="text-right font-mono tabular-nums text-sm">
                        {isApproved ? (
                          <span className={reduced ? "text-amber-700" : ""}>{(apprH ?? loggedH).toFixed(1)}</span>
                        ) : (
                          <span className="text-muted-foreground" title="Approved once the manager approves this day">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="h-8 w-full text-left text-sm border rounded-md px-2 hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring truncate"
                            title={r.comments || "Click to view / edit"}
                          >
                            {r.comments?.trim()
                              ? <span className="truncate block">{r.comments}</span>
                              : <span className="text-muted-foreground italic">{mayEdit ? "Add comment…" : "—"}</span>}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80" align="start">
                          <div className="space-y-2">
                            <div className="text-xs font-medium">Employee comment</div>
                            <Textarea
                              value={r.comments ?? ""}
                              onChange={(e) => updateRow(i, { comments: e.target.value })}
                              placeholder="Optional context about this entry"
                              rows={4}
                              className="text-sm"
                              disabled={!mayEdit}
                            />
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!mayEdit} onClick={() => deleteRow(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>


          <div className="flex items-center justify-between gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={addRow} disabled={!mayEdit}>
              <Plus className="h-4 w-4 mr-1" /> Add row
            </Button>
            <div className="flex items-center gap-2">
              {canApprove && (
                <Button variant={isApproved ? "outline" : "secondary"} size="sm" onClick={toggleApproval} disabled={saving}>
                  {isApproved ? "Unapprove day" : "Approve day"}
                </Button>
              )}
              <Button size="sm" onClick={save} disabled={saving || !mayEdit}>
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>
          </div>
          {!mayEdit && !canApprove && (
            <p className="text-xs text-muted-foreground pt-1">This day is approved and locked. Ask your manager to unapprove to make changes.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TaskPickerCell({
  value, title, invalid, legacyTaskMissing, tasks, projects, projectById, assigneeId, onPick,
}: {
  value: string;
  title: string;
  invalid: boolean;
  legacyTaskMissing: boolean;
  tasks: UserTask[];
  projects: Project[];
  projectById: Map<string, Project>;
  assigneeId: string;
  onPick: (taskId: string) => void;
}) {
  const qc = useQueryClient();
  const createTask = useServerFn(createTaskFull);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [newTitle, setNewTitle] = useState("");
  const [newProject, setNewProject] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const selected = tasks.find((t) => t.id === value) ?? null;
  const displayTitle = selected?.title ?? title ?? "";

  function startCreate(prefill: string) {
    setNewTitle(prefill);
    setNewProject("");
    setMode("create");
  }

  async function submitCreate() {
    const t = newTitle.trim();
    if (!t) { toast.error("Title required"); return; }
    if (!newProject) { toast.error("Pick a project"); return; }
    setCreating(true);
    try {
      const created = await createTask({
        data: {
          projectId: newProject,
          title: t,
          priority: "medium",
          assigneeId,
          assetLinks: [],
          domainId: null,
          departmentId: null,
          taskTypeIds: [],
        },
      });
      const newId = (created as { id: string }).id;
      const proj = projectById.get(newProject);
      // Optimistically inject so pickTask can resolve title/project before
      // the query refetch completes.
      qc.setQueryData(["day-editor-user-tasks", assigneeId], (prev: UserTask[] | undefined) => {
        const list = prev ?? [];
        return [{ id: newId, title: t, project_id: newProject, status: "todo" }, ...list];
      });
      await qc.invalidateQueries({ queryKey: ["day-editor-user-tasks", assigneeId] });
      onPick(newId);
      toast.success(proj ? `Created in ${proj.code}` : "Task created");
      setOpen(false);
      setMode("pick");
      setSearch("");
      setNewTitle("");
      setNewProject("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) { setMode("pick"); setSearch(""); }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={`h-8 w-full justify-between font-normal px-2 ${invalid ? "border-destructive/60" : ""}`}
        >
          <span className="truncate text-left flex-1 min-w-0 text-sm">
            {displayTitle
              ? <span className="truncate">{displayTitle}{legacyTaskMissing && <span className="text-[10px] text-muted-foreground ml-1">· legacy</span>}</span>
              : <span className="text-muted-foreground italic">Pick a task</span>}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        {mode === "pick" ? (
          <Command>
            <CommandInput
              placeholder="Search tasks…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  {tasks.length === 0 ? "No tasks assigned to you yet." : "No matches."}
                </div>
              </CommandEmpty>
              {tasks.length > 0 && (
                <CommandGroup heading="Your assigned tasks">
                  {tasks.map((t) => {
                    const proj = t.project_id ? projectById.get(t.project_id) : undefined;
                    return (
                      <CommandItem
                        key={t.id}
                        value={`${t.title} ${proj?.code ?? ""} ${proj?.name ?? ""}`}
                        onSelect={() => { onPick(t.id); setOpen(false); setSearch(""); }}
                        className="items-start"
                      >
                        <Check className={`h-4 w-4 mr-2 mt-0.5 shrink-0 ${value === t.id ? "opacity-100" : "opacity-0"}`} />
                        <span className="flex flex-col min-w-0 flex-1">
                          <span className="truncate">{t.title}</span>
                          {proj && <span className="text-[11px] text-muted-foreground truncate">{proj.code} · {proj.name}</span>}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              <CommandGroup>
                <CommandItem
                  value="__create__"
                  onSelect={() => startCreate(search)}
                  className="text-primary"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-2" />
                  {search.trim() ? <>Create task "<span className="font-medium truncate">{search.trim()}</span>"</> : "Create new task…"}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <div className="p-3 space-y-2">
            <div className="text-xs font-medium">Create task (assigned to this person)</div>
            <Input
              autoFocus
              placeholder="Task title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="h-8 text-sm"
            />
            <Select value={newProject} onValueChange={setNewProject}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Pick project" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.code} · {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => setMode("pick")} disabled={creating}>Back</Button>
              <Button type="button" size="sm" onClick={submitCreate} disabled={creating || !newTitle.trim() || !newProject}>
                {creating ? "Creating…" : "Create & pick"}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Same as creating from the Tasks page — priority defaults to Medium, no due date. You can edit later.</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
