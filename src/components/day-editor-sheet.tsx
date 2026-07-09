import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Lock, Save, CheckCircle2, Info, MessageSquare, StickyNote } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

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
    setRows(((log?.tasks as Task[] | null) ?? []).map((t) => ({ ...t })));
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
    setRows((prev) => [...prev, { project_code: "", project_name: "", task_id: "", task_title: "", hours: 0, comments: "" }]);
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
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Task</TableHead>
                <TableHead className="min-w-[160px]">Project</TableHead>
                <TableHead className="w-[90px] text-right">Hours</TableHead>
                {canApprove && <TableHead className="w-[100px] text-right">Approved</TableHead>}
                <TableHead>Comments</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={canApprove ? 6 : 5} className="text-center text-sm text-muted-foreground py-6">No entries.</TableCell></TableRow>
              )}
              {rows.map((r, i) => {
                const legacyTaskMissing = !!r.task_id && !taskById.has(r.task_id);
                const derivedProject = r.project_code
                  ? `${r.project_code}${r.project_name ? " · " + r.project_name : ""}`
                  : "";
                return (
                  <TableRow key={i}>
                    <TableCell>
                      <Select
                        value={r.task_id ?? ""}
                        onValueChange={(v) => pickTask(i, v)}
                        disabled={!mayEdit}
                      >
                        <SelectTrigger className={`h-8 ${!r.task_id && Number(r.hours) > 0 ? "border-destructive/60" : ""}`}>
                          <SelectValue placeholder="Pick a task" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {legacyTaskMissing && r.task_title && (
                            <SelectItem value={r.task_id!}>{r.task_title} (legacy)</SelectItem>
                          )}
                          {(userTasks ?? []).length === 0 && !legacyTaskMissing && (
                            <div className="px-3 py-2 text-xs text-muted-foreground">No tasks assigned to you.</div>
                          )}
                          {(userTasks ?? []).map((t) => {
                            const proj = t.project_id ? projectById.get(t.project_id) : undefined;
                            return (
                              <SelectItem key={t.id} value={t.id}>
                                {proj?.code && <span className="font-mono text-xs mr-2 text-muted-foreground">{proj.code}</span>}
                                {t.title}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="h-8 flex items-center text-sm text-muted-foreground truncate">
                        {derivedProject || <span className="italic">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" min={0} step={0.25}
                        value={r.hours ?? 0}
                        onChange={(e) => updateRow(i, { hours: Number(e.target.value) })}
                        disabled={!mayEdit}
                        className="h-8 text-right font-mono"
                      />
                    </TableCell>
                    {canApprove && (
                      <TableCell className="text-right">
                        <Input
                          type="number" min={0} step={0.25}
                          value={r.approved_hours ?? ""}
                          placeholder={String(r.hours ?? 0)}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateRow(i, { approved_hours: v === "" ? undefined : Number(v) });
                          }}
                          className="h-8 text-right font-mono"
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Input
                        value={r.comments ?? ""}
                        onChange={(e) => updateRow(i, { comments: e.target.value })}
                        disabled={!mayEdit}
                        className="h-8"
                        placeholder="Optional"
                      />
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
