import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, X, Send, Pencil, CircleDot, CircleCheck, CircleDashed, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useCurrentUser } from "@/hooks/use-current-user";
import { StageEditor } from "./stage-editor";
import {
  listTaskStages, setTaskStages, submitStage, approveStage, rejectStage,
  type StageInput, type StageStatus, type StageKind,
} from "@/lib/tasks-stages.functions";

type Props = { taskId: string; canManage: boolean };

const STATUS_META: Record<StageStatus, { label: string; className: string; Icon: typeof CircleDot }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground", Icon: CircleDashed },
  active: { label: "Active", className: "bg-primary/15 text-primary border-primary/40", Icon: CircleDot },
  in_review: { label: "In review", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40", Icon: CircleDot },
  changes_requested: { label: "Changes requested", className: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40", Icon: RotateCcw },
  done: { label: "Done", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40", Icon: CircleCheck },
  skipped: { label: "Skipped", className: "bg-muted text-muted-foreground", Icon: CircleDashed },
};

const KIND_LABEL: Record<StageKind, string> = {
  work: "Work",
  internal_review: "Internal review",
  client_review: "Client review",
};

export function TaskStagesPanel({ taskId, canManage }: Props) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const listFn = useServerFn(listTaskStages);
  const setStagesFn = useServerFn(setTaskStages);
  const submitFn = useServerFn(submitStage);
  const approveFn = useServerFn(approveStage);
  const rejectFn = useServerFn(rejectStage);

  const { data, isLoading } = useQuery({
    queryKey: ["task-stages", taskId],
    queryFn: () => listFn({ data: { taskId } }),
  });

  const { data: people } = useQuery({
    queryKey: ["all-profiles-mini"],
    queryFn: async () =>
      (await supabase.from("profiles").select("id, full_name, email").order("full_name")).data ?? [],
  });

  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<StageInput[]>([]);
  const [noteByStage, setNoteByStage] = useState<Record<string, string>>({});
  const [rejectingStageId, setRejectingStageId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const stages = (data?.stages ?? []) as Array<{
    id: string; position: number; name: string; kind: StageKind; status: StageStatus;
    owner_id: string; reviewer_id: string | null;
    owner: { full_name: string | null; email: string | null } | null;
    reviewer: { full_name: string | null; email: string | null } | null;
    decision_note: string | null; completed_at: string | null; started_at: string | null;
  }>;
  const events = data?.events ?? [];

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["task-stages", taskId] }),
      qc.invalidateQueries({ queryKey: ["task-detail", taskId] }),
      qc.invalidateQueries({ queryKey: ["my-tasks"] }),
      qc.invalidateQueries({ queryKey: ["awaiting-my-review"] }),
    ]);
  }

  function openEditor() {
    setDraft(
      stages.length > 0
        ? stages.map((s) => ({ name: s.name, kind: s.kind, owner_id: s.owner_id }))
        : [{ name: "", kind: "work", owner_id: me?.id ?? "" }],
    );
    setEditorOpen(true);
  }

  async function saveDraft() {
    try {
      for (const s of draft) {
        if (!s.name.trim() || !s.owner_id) {
          toast.error("Fill in every stage name and owner.");
          return;
        }
      }
      await setStagesFn({ data: { taskId, stages: draft } });
      toast.success("Workflow saved");
      setEditorOpen(false);
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function doSubmit(stageId: string) {
    try {
      await submitFn({ data: { stageId, note: noteByStage[stageId] } });
      setNoteByStage((n) => ({ ...n, [stageId]: "" }));
      toast.success("Stage submitted");
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function doApprove(stageId: string) {
    try {
      await approveFn({ data: { stageId, note: noteByStage[stageId] } });
      setNoteByStage((n) => ({ ...n, [stageId]: "" }));
      toast.success("Approved");
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function doReject() {
    if (!rejectingStageId) return;
    if (!rejectNote.trim()) { toast.error("Note is required when sending back."); return; }
    try {
      await rejectFn({ data: { stageId: rejectingStageId, note: rejectNote } });
      setRejectingStageId(null); setRejectNote("");
      toast.success("Sent back with comments");
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  const eventsByStage = useMemo(() => {
    const map: Record<string, typeof events> = {};
    for (const e of events) {
      const eid = (e as { stage_id: string }).stage_id;
      (map[eid] ??= []).push(e);
    }
    return map;
  }, [events]);

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading workflow…</p>;

  if (stages.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Single-owner task. Turn on a multi-stage workflow to route it through multiple owners with approvals.
        </p>
        {canManage && (
          <>
            <Button size="sm" onClick={openEditor}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Set up workflow
            </Button>
            <StageEditorDialog
              open={editorOpen}
              onOpenChange={setEditorOpen}
              draft={draft}
              setDraft={setDraft}
              people={people ?? []}
              onSave={saveDraft}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Workflow</div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={openEditor}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit stages
          </Button>
        )}
      </div>

      <ol className="space-y-2">
        {stages.map((s) => {
          const meta = STATUS_META[s.status];
          const isCurrentOwner = me?.id === s.owner_id;
          const isActive = s.status === "active";
          const isChangesRequested = s.status === "changes_requested";
          const isReviewKind = s.kind !== "work";
          const canSubmit = isCurrentOwner && (isActive || isChangesRequested) && !isReviewKind;
          const canReview = isCurrentOwner && isActive && isReviewKind;

          return (
            <li key={s.id} className={`rounded-md border p-3 ${isActive ? "border-primary/40 bg-primary/[0.03]" : "border-border/60"}`}>
              <div className="flex items-start gap-2">
                <meta.Icon className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{s.position}. {s.name}</span>
                    <Badge variant="outline" className="text-[10px]">{KIND_LABEL[s.kind]}</Badge>
                    <Badge className={`text-[10px] border ${meta.className}`} variant="outline">{meta.label}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {isReviewKind ? "Reviewer" : "Owner"}: {s.owner?.full_name ?? s.owner?.email ?? "—"}
                    {s.completed_at && <> · done {format(new Date(s.completed_at), "MMM d")}</>}
                  </div>
                  {s.decision_note && (
                    <div className="mt-1 text-xs rounded bg-muted/50 px-2 py-1 whitespace-pre-wrap">
                      {isChangesRequested ? "↩︎ " : ""}{s.decision_note}
                    </div>
                  )}

                  {(canSubmit || canReview) && (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        rows={2}
                        placeholder={canReview ? "Optional note" : "Optional note for reviewer / next owner"}
                        value={noteByStage[s.id] ?? ""}
                        onChange={(e) => setNoteByStage((n) => ({ ...n, [s.id]: e.target.value }))}
                      />
                      <div className="flex flex-wrap gap-2">
                        {canSubmit && (
                          <Button size="sm" onClick={() => doSubmit(s.id)} className="gradient-primary">
                            <Send className="h-3.5 w-3.5 mr-1" /> Mark stage complete
                          </Button>
                        )}
                        {canReview && (
                          <>
                            <Button size="sm" onClick={() => doApprove(s.id)} className="gradient-primary">
                              <Check className="h-3.5 w-3.5 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => { setRejectingStageId(s.id); setRejectNote(noteByStage[s.id] ?? ""); }}>
                              <X className="h-3.5 w-3.5 mr-1" /> Send back
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {(eventsByStage[s.id]?.length ?? 0) > 0 && (
                    <details className="mt-2">
                      <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
                        History ({eventsByStage[s.id].length})
                      </summary>
                      <ul className="mt-1 space-y-1">
                        {eventsByStage[s.id].map((e) => {
                          const ee = e as { id: string; kind: string; actor: { full_name?: string } | null; created_at: string; note: string | null };
                          return (
                            <li key={ee.id} className="text-[11px] text-muted-foreground border-l-2 border-border pl-2">
                              <span className="font-medium text-foreground">{ee.actor?.full_name ?? "System"}</span>
                              {" "}{ee.kind.replace("_", " ")}
                              {" · "}{format(new Date(ee.created_at), "MMM d, HH:mm")}
                              {ee.note && <div className="whitespace-pre-wrap">{ee.note}</div>}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <StageEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        draft={draft}
        setDraft={setDraft}
        people={people ?? []}
        onSave={saveDraft}
      />

      <Dialog open={!!rejectingStageId} onOpenChange={(o) => { if (!o) { setRejectingStageId(null); setRejectNote(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send back with comments</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">The previous owner will get the task back with your note attached.</p>
          <Textarea rows={4} placeholder="What needs to change?" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRejectingStageId(null); setRejectNote(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={doReject}>Send back</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StageEditorDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  draft: StageInput[];
  setDraft: (r: StageInput[]) => void;
  people: Array<{ id: string; full_name: string | null; email: string | null }>;
  onSave: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Workflow stages</DialogTitle></DialogHeader>
        <StageEditor people={props.people} value={props.draft} onChange={props.setDraft} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button onClick={props.onSave} className="gradient-primary">Save workflow</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
