import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  punchOut as punchOutServerFn,
  type PunchOutResult,
  type PunchSessionResult,
} from "@/lib/punch.functions";
import { requestTaskFromManager } from "@/lib/tasks-plus.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Check, ChevronsUpDown, Send, AlertTriangle, MessageSquare } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { toast } from "sonner";

type Row = { taskId: string; hours: string; comments: string; atRisk: boolean; added?: boolean };

export type PunchOutSession = PunchSessionResult;

export function PunchOutLogDialog({
  open,
  onOpenChange,
  session,
  userId,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  session: PunchOutSession | null;
  userId: string;
  onCompleted?: (result: PunchOutResult) => void;
}) {
  const qc = useQueryClient();
  const punchOutServer = useServerFn(punchOutServerFn);
  const requestTaskServer = useServerFn(requestTaskFromManager);

  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [punchOutAt, setPunchOutAt] = useState<string>("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [requestOpen, setRequestOpen] = useState(false);
  const [reqTitle, setReqTitle] = useState("");
  const [reqProjectId, setReqProjectId] = useState<string>("");
  const [reqNote, setReqNote] = useState("");
  const [reqSubmitting, setReqSubmitting] = useState(false);

  const { data: myTasks } = useQuery({
    queryKey: ["my-punch-tasks", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, status, project_id, updated_at, due_date, project:projects(id, code, name)")
        .eq("assignee_id", userId)
        .in("status", ["todo", "in_progress", "review", "done"])
        .not("project_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(500);
      const rows = (data ?? []) as Array<{
        id: string;
        title: string;
        status: string;
        project_id: string | null;
        updated_at: string | null;
        due_date: string | null;
        project: { id: string; code: string; name: string } | null;
      }>;
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const visible = rows.filter((t) => {
        if (t.status !== "done") return true;
        if (!t.updated_at) return true;
        return new Date(t.updated_at).getTime() >= threeDaysAgo;
      });
      return [
        ...visible.filter((t) => t.status !== "done"),
        ...visible.filter((t) => t.status === "done"),
      ];
    },
    staleTime: 60_000,
  });

  const { data: loggedTaskIds } = useQuery({
    queryKey: ["punch-logged-task-ids", userId],
    enabled: !!userId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("punch_sessions")
        .select("allocations")
        .eq("user_id", userId)
        .not("punch_out_time", "is", null)
        .not("allocations", "is", null);
      const set = new Set<string>();
      for (const row of (data ?? []) as Array<{ allocations: Array<{ task_id?: string | null }> | null }>) {
        for (const a of row.allocations ?? []) {
          if (a?.task_id) set.add(String(a.task_id));
        }
      }
      return set;
    },
    staleTime: 60_000,
  });

  const { data: projects } = useQuery({
    queryKey: ["projects-for-log"],
    queryFn: async () => (await supabase.from("projects").select("id, code, name").order("code")).data ?? [],
  });

  const visibleTasks = useMemo(() => {
    if (!myTasks) return [];
    return myTasks.filter((t) => !(t.status === "done" && loggedTaskIds?.has(t.id)));
  }, [myTasks, loggedTaskIds]);

  const doneTodayTasks = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    return visibleTasks.filter(
      (t) => t.status === "done" && !!t.updated_at && new Date(t.updated_at).getTime() >= startMs,
    );
  }, [visibleTasks]);

  const otherAvailableTasks = useMemo(() => {
    const doneTodayIds = new Set(doneTodayTasks.map((t) => t.id));
    return visibleTasks.filter((t) => !doneTodayIds.has(t.id));
  }, [visibleTasks, doneTodayTasks]);

  const taskById = useMemo(() => {
    const m = new Map<string, NonNullable<typeof myTasks>[number]>();
    for (const t of myTasks ?? []) m.set(t.id, t);
    return m;
  }, [myTasks]);

  function toLocalDatetimeInput(d: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  useEffect(() => {
    if (!open || !session) return;
    setRows(doneTodayTasks.map((t) => ({ taskId: t.id, hours: "", comments: "", atRisk: false })));
    setPunchOutAt(toLocalDatetimeInput(new Date()));
    setNowTick(Date.now());
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session?.id]);

  const sessionDurationHours = useMemo(() => {
    if (!session) return 0;
    return Number((differenceInMinutes(new Date(nowTick), new Date(session.punch_in_time)) / 60).toFixed(2));
  }, [session, nowTick]);

  const allocatedTotal = rows.reduce((s, r) => s + (Number(r.hours) || 0), 0);

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addTaskRow(taskId: string) {
    if (!taskId) return;
    setRows((prev) =>
      prev.some((r) => r.taskId === taskId)
        ? prev
        : [...prev, { taskId, hours: "", comments: "", atRisk: false, added: true }],
    );
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function performPunchOut(opts: { skip: boolean }) {
    if (!session) return;
    let punchOutIso: string | null = null;
    if (punchOutAt) {
      const d = new Date(punchOutAt);
      if (Number.isNaN(d.getTime())) {
        toast.error("Invalid punch-out time.");
        return;
      }
      if (d.getTime() <= new Date(session.punch_in_time).getTime()) {
        toast.error("Punch-out must be after punch-in.");
        return;
      }
      if (d.getTime() > Date.now() + 60_000) {
        toast.error("Punch-out can't be in the future.");
        return;
      }
      punchOutIso = d.toISOString();
    }

    const usableRows = opts.skip ? [] : rows.filter((r) => r.taskId && Number(r.hours) > 0);
    if (!opts.skip) {
      for (const [i, r] of usableRows.entries()) {
        const t = taskById.get(r.taskId);
        if (!t?.project_id) {
          toast.error(`Row ${i + 1}: this task has no project — set one on the task first.`);
          return;
        }
      }
    }

    const allocations = usableRows.map((r) => {
      const t = taskById.get(r.taskId);
      return {
        projectId: t?.project_id ?? "",
        taskId: r.taskId,
        hours: Number(Number(r.hours).toFixed(2)),
        comments: r.comments.trim(),
        atRisk: !!r.atRisk,
      };
    });
    const totalLogged = Number(allocations.reduce((s, a) => s + a.hours, 0).toFixed(2));

    setSubmitting(true);
    try {
      const result = (await punchOutServer({
        data: { sessionId: session.id, allocations, punchOutTime: punchOutIso, skip: opts.skip },
      })) as PunchOutResult;
      if (opts.skip) {
        toast.success("Punched out — you can log hours later.");
      } else {
        toast.success(
          `Punched out — ${totalLogged.toFixed(2)}h logged across ${allocations.length} entr${allocations.length === 1 ? "y" : "ies"}.`,
        );
      }
      onOpenChange(false);
      onCompleted?.(result);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["punch-sessions-today"] }),
        qc.invalidateQueries({ queryKey: ["punch-history"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["attendance"] }),
        qc.invalidateQueries({ queryKey: ["attendance-overview"] }),
        qc.invalidateQueries({ queryKey: ["quick-punch-session"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not punch out.");
    } finally {
      setSubmitting(false);
    }
  }

  const submitPunchOut = () => performPunchOut({ skip: false });
  const skipPunchOut = () => performPunchOut({ skip: true });

  async function submitTaskRequest() {
    if (!reqTitle.trim()) {
      toast.error("Task title is required.");
      return;
    }
    setReqSubmitting(true);
    try {
      await requestTaskServer({
        data: { title: reqTitle.trim(), projectId: reqProjectId || null, note: reqNote.trim() || null },
      });
      toast.success("Request sent — your manager has been notified.");
      setRequestOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send request.");
    } finally {
      setReqSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 shrink-0">
            <DialogTitle className="font-display">Log this session</DialogTitle>
            <DialogDescription>
              {session && `Fill in hours only for the tasks you actually worked on this session.`}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pt-4 space-y-4 shrink-0">
            {session &&
              (() => {
                const end = punchOutAt ? new Date(punchOutAt) : new Date(nowTick);
                const live = Number.isNaN(end.getTime())
                  ? sessionDurationHours
                  : Math.max(
                      0,
                      Number((differenceInMinutes(end, new Date(session.punch_in_time)) / 60).toFixed(2)),
                    );
                return (
                  <div className="rounded-lg border border-border/60 p-4 bg-gradient-to-br from-primary/5 to-transparent">
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-4xl font-bold tabular-nums">{live.toFixed(2)}</span>
                      <span className="text-lg text-muted-foreground">h this session</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Punched in at {format(new Date(session.punch_in_time), "HH:mm")} — split across the tasks you worked on.
                    </p>
                  </div>
                );
              })()}

            {session && (
              <div className="rounded-lg border border-border/60 p-3 bg-muted/20 space-y-1.5">
                <Label className="text-xs">Punch-out date & time</Label>
                <Input
                  type="datetime-local"
                  value={punchOutAt}
                  min={toLocalDatetimeInput(new Date(session.punch_in_time))}
                  max={toLocalDatetimeInput(new Date())}
                  onChange={(e) => setPunchOutAt(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Default is now. Change it if you're logging a session from a previous day or an earlier time.
                </p>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
            {rows.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground text-center">
                No tasks marked Done today. Use "Add another task" below to log time against a specific task, or skip and log later.
              </div>
            )}

            {rows.map((r, idx) => {
              const t = taskById.get(r.taskId);
              const hasHours = Number(r.hours) > 0;
              const dateLabel = t
                ? t.status === "done" && t.updated_at
                  ? `Done · ${format(new Date(t.updated_at), "MMM d")}`
                  : t.due_date
                    ? `Due ${format(new Date(t.due_date), "MMM d")}`
                    : "No due date"
                : null;
              return (
                <div
                  key={r.taskId || idx}
                  className={`rounded-lg border border-border/60 p-3 space-y-2 ${hasHours ? "bg-muted/30" : "bg-muted/10"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{t?.title ?? "Unknown task"}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {t?.project?.name && (
                          <span className="text-[11px] text-muted-foreground truncate">{t.project.name}</span>
                        )}
                        {dateLabel && (
                          <span
                            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-border/60 ${t?.status === "done" ? "text-success" : "text-muted-foreground"}`}
                          >
                            {dateLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-[110px] shrink-0">
                      <Input
                        type="number"
                        min="0"
                        step="0.25"
                        placeholder="Hours"
                        value={r.hours}
                        onChange={(e) => updateRow(idx, { hours: e.target.value })}
                        className="h-9"
                      />
                    </div>
                    {r.added && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(idx)}
                        className="text-destructive h-9 px-2 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {hasHours && (
                    <>
                      <Textarea
                        rows={2}
                        placeholder="What did you do on this task? (optional)"
                        value={r.comments}
                        onChange={(e) => updateRow(idx, { comments: e.target.value })}
                      />
                      <TaskCommentsPreview taskId={r.taskId} />
                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <Checkbox
                          checked={r.atRisk}
                          onCheckedChange={(v) => updateRow(idx, { atRisk: v === true })}
                        />
                        <span className="inline-flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                          Flag this task as <span className="font-medium text-foreground">at risk</span> — visible to your reporting manager.
                        </span>
                      </label>
                    </>
                  )}
                </div>
              );
            })}

            <div className="rounded-lg border border-dashed border-border/60 p-3 space-y-2">
              <Label className="text-xs">Add another task</Label>
              <TaskCombobox
                tasks={otherAvailableTasks.filter((t) => !rows.some((r) => r.taskId === t.id))}
                value=""
                onChange={(taskId) => addTaskRow(taskId)}
                allowNone={false}
              />
              <p className="text-[11px] text-muted-foreground">In Progress, To Do, or Done in the last 3 days.</p>
              <button
                type="button"
                onClick={() => {
                  setReqTitle("");
                  setReqProjectId("");
                  setReqNote("");
                  setRequestOpen(true);
                }}
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <Send className="h-3 w-3" /> Can't find your task? Request one from your manager
              </button>
            </div>
          </div>

          <div className="shrink-0 border-t border-border/60 bg-background px-6 py-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Session length:{" "}
                <span className="font-semibold text-foreground">
                  {(() => {
                    if (!session) return sessionDurationHours.toFixed(2);
                    const end = punchOutAt ? new Date(punchOutAt) : new Date(nowTick);
                    if (Number.isNaN(end.getTime())) return sessionDurationHours.toFixed(2);
                    return Math.max(
                      0,
                      Number((differenceInMinutes(end, new Date(session.punch_in_time)) / 60).toFixed(2)),
                    ).toFixed(2);
                  })()}
                  h
                </span>
              </span>
              <span className="font-semibold text-foreground">
                Logging: {allocatedTotal.toFixed(2)}h{" "}
                <span className="text-muted-foreground font-normal">(doesn't have to match)</span>
              </span>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" onClick={skipPunchOut} disabled={submitting} className="text-muted-foreground">
                Skip for now
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button onClick={submitPunchOut} disabled={submitting} className="gradient-primary">
                  {submitting ? "Saving…" : "Punch out & log hours"}
                </Button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Request a task</DialogTitle>
            <DialogDescription>
              Your reporting manager will get this in their notifications and can create the task for you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Task title <span className="text-destructive">*</span>
              </Label>
              <Input value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} placeholder="What do you need a task for?" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Project (optional)</Label>
              <Select value={reqProjectId || "__none__"} onValueChange={(v) => setReqProjectId(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No project —</SelectItem>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-mono text-xs mr-2">{p.code}</span>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Note (optional)</Label>
              <Textarea rows={3} value={reqNote} onChange={(e) => setReqNote(e.target.value)} placeholder="Context for your manager" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)} disabled={reqSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitTaskRequest} disabled={reqSubmitting} className="gradient-primary">
              {reqSubmitting ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type TaskComboTask = {
  id: string;
  title: string;
  status?: string;
  project_id: string | null;
  project: { code: string; name: string } | null;
};

function TaskCombobox({
  tasks,
  value,
  onChange,
  allowNone,
}: {
  tasks: TaskComboTask[];
  value: string;
  onChange: (taskId: string, projectId: string | null) => void;
  allowNone: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = tasks.find((t) => t.id === value) ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-auto py-2">
          <span className="truncate text-left flex-1 min-w-0">
            {selected ? (
              <span className="flex flex-col min-w-0">
                <span className="truncate">{selected.title}</span>
                {selected.project?.name && (
                  <span className="text-[11px] text-muted-foreground truncate">{selected.project.name}</span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">Pick one of your tasks</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by task or project…" />
          <CommandList>
            <CommandEmpty>No tasks found.</CommandEmpty>
            {allowNone && (
              <CommandGroup>
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange("", null);
                    setOpen(false);
                  }}
                >
                  <Check className={`h-4 w-4 mr-2 ${!value ? "opacity-100" : "opacity-0"}`} />— No task —
                </CommandItem>
              </CommandGroup>
            )}
            {(() => {
              const byStatus: Record<string, TaskComboTask[]> = {};
              for (const t of tasks) {
                const s = t.status ?? "todo";
                (byStatus[s] ??= []).push(t);
              }
              const STATUS_ORDER = ["todo", "in_progress", "review", "done"] as const;
              const STATUS_LABELS: Record<string, string> = {
                todo: "To Do",
                in_progress: "In Progress",
                review: "Review",
                done: "Done",
              };
              const STATUS_COLORS: Record<string, string> = {
                todo: "text-muted-foreground",
                in_progress: "text-primary",
                review: "text-warning",
                done: "text-success",
              };
              const renderItem = (t: TaskComboTask) => (
                <CommandItem
                  key={t.id}
                  value={`${t.title} ${t.project?.name ?? ""} ${t.project?.code ?? ""}`}
                  onSelect={() => {
                    onChange(t.id, t.project_id);
                    setOpen(false);
                  }}
                  className="items-start"
                >
                  <Check className={`h-4 w-4 mr-2 mt-0.5 shrink-0 ${value === t.id ? "opacity-100" : "opacity-0"}`} />
                  <span className="flex flex-col flex-1 min-w-0">
                    <span className="truncate">{t.title}</span>
                    {t.project?.name && (
                      <span className="text-[11px] text-muted-foreground truncate">{t.project.name}</span>
                    )}
                  </span>
                  {t.status && (
                    <span
                      className={`ml-2 text-[10px] uppercase tracking-wide shrink-0 ${STATUS_COLORS[t.status] ?? "text-muted-foreground"}`}
                    >
                      {STATUS_LABELS[t.status] ?? t.status}
                    </span>
                  )}
                </CommandItem>
              );
              return (
                <>
                  {STATUS_ORDER.map((status) => {
                    const group = byStatus[status];
                    if (!group || group.length === 0) return null;
                    return (
                      <CommandGroup key={status} heading={STATUS_LABELS[status]}>
                        {group.map(renderItem)}
                      </CommandGroup>
                    );
                  })}
                </>
              );
            })()}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TaskCommentsPreview({ taskId }: { taskId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["punch-task-comments", taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_comments")
        .select("id, body, created_at, author:profiles!task_comments_author_id_fkey(full_name)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(10);
      return (data ?? []) as Array<{
        id: string;
        body: string;
        created_at: string;
        author: { full_name: string | null } | null;
      }>;
    },
    staleTime: 30_000,
  });
  return (
    <div className="rounded-md border border-border/60 bg-background/50 p-2 space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <MessageSquare className="h-3 w-3" /> Comments on this task
      </div>
      {isLoading ? (
        <p className="text-[11px] text-muted-foreground">Loading…</p>
      ) : (data?.length ?? 0) === 0 ? (
        <p className="text-[11px] text-muted-foreground">No comments on this task yet.</p>
      ) : (
        <div className="max-h-[180px] overflow-y-auto space-y-2 pr-1">
          {data!.map((c) => (
            <div key={c.id} className="text-xs">
              <div className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{c.author?.full_name ?? "Someone"}</span>
                {" · "}
                {format(new Date(c.created_at), "MMM d, HH:mm")}
              </div>
              <div className="whitespace-pre-wrap line-clamp-3">{c.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
