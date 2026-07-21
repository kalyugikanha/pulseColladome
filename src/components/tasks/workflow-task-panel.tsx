import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Circle, Workflow, Star } from "lucide-react";
import { closeTask, reviewTask, listTaskReviewComments, type WorkflowStageInput } from "@/lib/workflows.functions";
import { StandupFlagButton } from "@/components/tasks/standup-flag-button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useViewAs } from "@/hooks/use-view-as";
import { format } from "date-fns";

type TaskInfo = {
  id: string; title: string; status: string;
  assignee_id: string | null;
  reviewer_id: string | null;
  workflow_instance_id: string | null;
  stage_index: number | null;
  stage_snapshot: WorkflowStageInput | null;
  project: { code: string | null; name: string | null } | null;
};


export function WorkflowTaskPanel({ taskId, onChanged, onOpenTask }: { taskId: string; onChanged?: () => void | Promise<void>; onOpenTask?: (id: string) => void }) {
  const { data: me } = useCurrentUser();
  const [task, setTask] = useState<TaskInfo | null>(null);
  const [instance, setInstance] = useState<{ id: string; started_by: string; template_id: string; template_name: string; total_stages: number } | null>(null);
  const [siblings, setSiblings] = useState<Array<{ id: string; title: string; status: string; stage_index: number | null; stage_snapshot: { name?: string } | null }>>([]);
  const [templateStages, setTemplateStages] = useState<WorkflowStageInput[]>([]);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState<"approve" | "request_changes" | "comment" | null>(null);
  const closeFn = useServerFn(closeTask);

  const listComments = useServerFn(listTaskReviewComments);
  const { data: comments, refetch: refetchComments } = useQuery({
    queryKey: ["task-review-comments", taskId],
    queryFn: () => listComments({ data: { taskId } }),
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("tasks")
        .select("id, title, status, assignee_id, reviewer_id, workflow_instance_id, stage_index, stage_snapshot, project:projects(code, name)")
        .eq("id", taskId).single();
      setTask(data as unknown as TaskInfo);
      if (data?.workflow_instance_id) {
        const { data: inst } = await supabase.from("workflow_instances" as never)
          .select("id, started_by, template_id, template:workflow_templates(name)")
          .eq("id", data.workflow_instance_id).single();
        const i = inst as unknown as { id: string; started_by: string; template_id: string; template: { name: string } | null } | null;
        if (i) {
          const { data: sc } = await supabase.from("workflow_template_stages" as never)
            .select("*").eq("template_id", i.template_id).order("position");
          const allStages = (sc as unknown as WorkflowStageInput[]) ?? [];
          setTemplateStages(allStages);
          setInstance({ ...i, template_name: i.template?.name ?? "Workflow", total_stages: allStages.length });
        }
        const { data: sibs } = await supabase.from("tasks")
          .select("id, title, status, stage_index, stage_snapshot")
          .eq("workflow_instance_id", data.workflow_instance_id)
          .order("stage_index");
        setSiblings((sibs as unknown as Array<{ id: string; title: string; status: string; stage_index: number | null; stage_snapshot: { name?: string } | null }>) ?? []);
      }
    })();
  }, [taskId]);

  const stage = task?.stage_snapshot;
  const actingUserId = me?.id ?? null;
  const isAssignee = task?.assignee_id === actingUserId;
  // Reviewer is whoever is assigned as task.reviewer_id, resolved against the
  // impersonation-aware acting user. Allow both "review" and "done" so a task
  // that got approved but stuck (no next stage spawned) can still be acted on.
  const isReviewer =
    !!task && !!actingUserId && task.reviewer_id === actingUserId &&
    (task.status === "review" || task.status === "done");

  if (!task || !task.workflow_instance_id || !stage || !instance) return null;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Workflow className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{instance.template_name}</span>
        <Badge variant="outline">Stage {task.stage_index} of {instance.total_stages}: {stage.name}</Badge>
        {task.project && <Badge variant="outline" className="font-mono">{task.project.code ?? "Project"} · {task.project.name}</Badge>}
        {stage.requires_review && <Badge variant="secondary">Review required</Badge>}
      </div>

      {siblings.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {siblings.map((s) => {
            const isCurrent = s.id === task.id;
            const stageName = (s as unknown as { stage_snapshot?: { name?: string } }).stage_snapshot?.name;
            const label = `Stage ${s.stage_index}${stageName ? `: ${stageName}` : ""} · ${s.status.replace("_", " ")}`;
            const cls = `inline-flex items-center gap-1 text-xs rounded-full border px-2 py-0.5 transition-colors ${
              isCurrent
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary hover:text-foreground cursor-pointer"
            }`;
            const icon = s.status === "done" ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />;
            if (isCurrent || !onOpenTask) {
              return <span key={s.id} className={cls} title={label}>{icon}#{s.stage_index}</span>;
            }
            return (
              <button key={s.id} type="button" className={cls} title={`Jump to ${label}`} onClick={() => onOpenTask(s.id)}>
                {icon}#{s.stage_index}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {isAssignee && task.status !== "done" && (
          <Button
            size="sm"
            className="gradient-primary"
            onClick={async () => {
              // For a non-branching stage, if the next fixed stage has an offset,
              // we still want to open the dialog so the user can confirm/adjust.
              let nextStageHasOffset = false;
              if ((stage.branch_options ?? []).length === 0) {
                let nextPos = stage.next_stage_position ?? null;
                if (nextPos == null) {
                  const later = templateStages.find((s) => s.position > (task.stage_index ?? stage.position));
                  nextPos = later?.position ?? null;
                }
                if (nextPos != null) {
                  const ns = templateStages.find((s) => s.position === nextPos);
                  nextStageHasOffset = ns?.default_due_offset_days != null;
                }
              } else {
                // Branching — offsets get chosen after branch pick, so always dialog.
                nextStageHasOffset = true;
              }
              const needsDialog =
                (stage.required_fields ?? []).length > 0 ||
                (stage.branch_options ?? []).length > 0 ||
                nextStageHasOffset;
              if (needsDialog) {
                setCloseOpen(true);
                return;
              }
              try {
                await closeFn({ data: { taskId: task.id } });
                toast.success("Stage closed");
                await refetchComments();
                await onChanged?.();
              } catch (e) { toast.error((e as Error).message); }
            }}
          >
            Close this stage
          </Button>
        )}
        {isReviewer && (
          <>
            <Button size="sm" className="gradient-primary" onClick={() => setReviewOpen("approve")}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => setReviewOpen("request_changes")}>Request changes</Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={() => setReviewOpen("comment")}>Add review comment</Button>
        <StandupFlagButton taskId={task.id} />
      </div>

      {(comments?.length ?? 0) > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Review history</div>
          {(comments ?? []).map((c) => (
            <div key={c.id} className="text-xs border-l-2 pl-2 py-0.5">
              <span className="font-medium">{c.author?.full_name ?? "Someone"}</span>{" "}
              <span className="text-muted-foreground">{c.kind.replace(/_/g, " ")}</span>
              {c.body && <div className="text-muted-foreground italic">"{c.body}"</div>}
              <span className="text-muted-foreground text-[10px]">{format(new Date(c.created_at), "MMM d HH:mm")}</span>
            </div>
          ))}
        </div>
      )}

      {closeOpen && (
        <CloseStageDialog
          task={task} stage={stage} templateStages={templateStages} onClose={() => setCloseOpen(false)}
          onDone={async () => { setCloseOpen(false); await refetchComments(); await onChanged?.(); }}
        />
      )}
      {reviewOpen && (
        <ReviewDialog
          action={reviewOpen} task={task} stage={stage} templateStages={templateStages} onClose={() => setReviewOpen(null)}
          onDone={async () => { setReviewOpen(null); await refetchComments(); await onChanged?.(); }}
        />
      )}

    </div>
  );
}

function resolveNextStage(
  stage: WorkflowStageInput,
  templateStages: WorkflowStageInput[],
  currentPos: number,
  branchKey: string | null,
): WorkflowStageInput | null {
  let nextPos: number | null = null;
  if ((stage.branch_options ?? []).length > 0) {
    if (!branchKey) return null;
    nextPos = stage.branch_target_map[branchKey] ?? null;
  } else if (stage.next_stage_position != null) {
    nextPos = stage.next_stage_position;
  } else {
    const later = templateStages.find((s) => s.position > currentPos);
    nextPos = later?.position ?? null;
  }
  if (nextPos == null) return null;
  return templateStages.find((s) => s.position === nextPos) ?? null;
}

function CloseStageDialog({ task, stage, templateStages, onClose, onDone }: { task: TaskInfo; stage: WorkflowStageInput; templateStages: WorkflowStageInput[]; onClose: () => void; onDone: () => void | Promise<void> }) {
  const close = useServerFn(closeTask);
  const [branchKey, setBranchKey] = useState<string>("");
  const [nextAssignee, setNextAssignee] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [dueOffset, setDueOffset] = useState<string>("");
  const [offsetTouched, setOffsetTouched] = useState(false);

  useEffect(() => {
    supabase.rpc("list_assignable_users").then(({ data }) => setPeople((data ?? []) as typeof people));
  }, []);

  const hasBranches = stage.branch_options.length > 0;
  const missingRequired = (stage.required_fields ?? []).some((f) => f.required && !values[f.key]);

  const currentPos = task.stage_index ?? stage.position;
  const nextStage = resolveNextStage(stage, templateStages, currentPos, hasBranches ? (branchKey || null) : null);

  // Sync default offset from resolved next stage when branch changes.
  useEffect(() => {
    if (offsetTouched) return;
    setDueOffset(nextStage?.default_due_offset_days != null ? String(nextStage.default_due_offset_days) : "");
  }, [nextStage?.position, nextStage?.default_due_offset_days, offsetTouched]);

  async function submit() {
    setBusy(true);
    try {
      const parsedOffset = dueOffset === "" ? null : Math.max(0, Number(dueOffset));
      await close({ data: {
        taskId: task.id,
        branchKey: hasBranches ? (branchKey || null) : null,
        nextAssigneeId: hasBranches ? (nextAssignee || null) : null,
        nextDueOffsetDays: parsedOffset,
        requiredFieldValues: values,
        rating: null,
      }});
      toast.success("Stage closed");
      await onDone();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Close: {stage.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {(stage.required_fields ?? []).map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs">{f.label}{f.required ? " *" : ""}</Label>
              <Input value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} placeholder={f.kind === "url" ? "https://..." : f.kind === "attachment" ? "Paste link to file" : ""} autoFocus />
            </div>
          ))}
          {hasBranches && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Which branch is next? *</Label>
                <Select value={branchKey} onValueChange={(v) => { setBranchKey(v); setOffsetTouched(false); }}>
                  <SelectTrigger><SelectValue placeholder="Pick branch" /></SelectTrigger>
                  <SelectContent>
                    {stage.branch_options.map((b) => <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Assign next stage to (optional)</Label>
                <Select value={nextAssignee} onValueChange={setNextAssignee}>
                  <SelectTrigger><SelectValue placeholder="Use stage default" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          {nextStage && (
            <div className="space-y-1">
              <Label className="text-xs">
                Next stage deadline (days from today){nextStage.name ? ` — ${nextStage.name}` : ""}
              </Label>
              <Input
                type="number"
                min={0}
                value={dueOffset}
                onChange={(e) => { setOffsetTouched(true); setDueOffset(e.target.value); }}
                placeholder="No auto due date"
              />
            </div>
          )}
          {stage.requires_review && <p className="text-xs text-muted-foreground">This stage requires review — task moves to Review after you close it.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gradient-primary" onClick={submit}
            disabled={busy || (hasBranches && !branchKey) || missingRequired}
          >Close stage</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function ReviewDialog({ action, task, stage, templateStages, onClose, onDone }: {
  action: "approve" | "request_changes" | "comment"; task: TaskInfo; stage: WorkflowStageInput;
  templateStages: WorkflowStageInput[];
  onClose: () => void; onDone: () => void | Promise<void>;
}) {
  const review = useServerFn(reviewTask);
  const { viewAsUserId } = useViewAs();
  const { data: me } = useCurrentUser();
  const [body, setBody] = useState("");
  const [branchKey, setBranchKey] = useState("");
  const [nextAssignee, setNextAssignee] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [people, setPeople] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [busy, setBusy] = useState(false);
  const [dueOffset, setDueOffset] = useState<string>("");
  const [offsetTouched, setOffsetTouched] = useState(false);

  useEffect(() => {
    supabase.rpc("list_assignable_users").then(({ data }) => setPeople((data ?? []) as typeof people));
  }, []);

  const hasBranches = stage.branch_options.length > 0 && action === "approve";
  const actingUserId = viewAsUserId ?? me?.id ?? null;
  const canRate = action === "approve" && !!task.assignee_id && !!actingUserId;
  const currentPos = task.stage_index ?? stage.position;
  const nextStage = action === "approve"
    ? resolveNextStage(stage, templateStages, currentPos, hasBranches ? (branchKey || null) : null)
    : null;

  useEffect(() => {
    if (offsetTouched) return;
    setDueOffset(nextStage?.default_due_offset_days != null ? String(nextStage.default_due_offset_days) : "");
  }, [nextStage?.position, nextStage?.default_due_offset_days, offsetTouched]);

  async function submit() {
    setBusy(true);
    try {
      const parsedOffset = dueOffset === "" ? null : Math.max(0, Number(dueOffset));
      await review({ data: {
        taskId: task.id, action,
        body: body.trim() || null,
        branchKey: hasBranches ? (branchKey || null) : null,
        nextAssigneeId: hasBranches ? (nextAssignee || null) : null,
        nextDueOffsetDays: action === "approve" ? parsedOffset : null,
        rating: canRate && rating > 0 ? rating : null,
      }});
      toast.success(action === "approve" ? "Approved" : action === "request_changes" ? "Sent back" : "Comment added");
      await onDone();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{action === "approve" ? "Approve" : action === "request_changes" ? "Request changes" : "Add review comment"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Textarea placeholder="Message to the assignee" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          {canRate && (
            <div className="space-y-1">
              <Label className="text-xs">Rate this work (optional)</Label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(rating === n ? 0 : n)}
                    className="p-1"
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  >
                    <Star className={`h-5 w-5 ${n <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                  </button>
                ))}
                {rating > 0 && (
                  <button type="button" onClick={() => setRating(0)} className="ml-2 text-xs text-muted-foreground hover:text-foreground">
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
          {hasBranches && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Next branch *</Label>
                <Select value={branchKey} onValueChange={(v) => { setBranchKey(v); setOffsetTouched(false); }}>
                  <SelectTrigger><SelectValue placeholder="Pick branch" /></SelectTrigger>
                  <SelectContent>
                    {stage.branch_options.map((b) => <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Assign next stage to (optional)</Label>
                <Select value={nextAssignee} onValueChange={setNextAssignee}>
                  <SelectTrigger><SelectValue placeholder="Use stage default" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gradient-primary" onClick={submit} disabled={busy || (hasBranches && !branchKey)}>
            {action === "approve" ? "Approve" : action === "request_changes" ? "Send back" : "Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

