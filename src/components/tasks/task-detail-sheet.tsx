import { Label } from "@/components/ui/label";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Slider } from "@/components/ui/slider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { Bell, BellOff, Check, X, MessageSquare, Users, History as HistoryIcon, Paperclip, Trash2, MoreVertical, Pencil, Workflow, Clock, Link as LinkIcon, ExternalLink, Copy, Star } from "lucide-react";
import { EditTaskDialog } from "./edit-task-dialog";
import { MarkDoneDialog } from "./mark-done-dialog";
import { duplicateTask } from "@/lib/tasks-plus.functions";
import { WorkflowTaskPanel } from "./workflow-task-panel";
import {
  getTaskDetail, setTaskStatus, submitReviewDecision, setReviewer, setCompletionPercent,
  addComment, resolveComment,
  toggleWatcher, rateTask,
  listTaskAttachments, insertTaskAttachment, deleteTaskAttachment, updateTaskAssetLinks,
} from "@/lib/tasks-workflow.functions";
import { logTaskTime } from "@/lib/workflows.functions";

import { useCurrentUser } from "@/hooks/use-current-user";
import { useViewAs } from "@/hooks/use-view-as";

type Props = { taskId: string | null; onClose: (nextTaskId?: string) => void; initialAction?: "mark-done" | null };

const STATUS: Array<"todo" | "in_progress" | "review" | "done"> = ["todo", "in_progress", "review", "done"];
const STATUS_LABEL: Record<string, string> = { todo: "To Do", in_progress: "In Progress", review: "In Review", done: "Done" };

export function TaskDetailSheet({ taskId, onClose, initialAction = null }: Props) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const { viewAsUserId } = useViewAs();
  const detailFn = useServerFn(getTaskDetail);
  const setStatusFn = useServerFn(setTaskStatus);
  const reviewFn = useServerFn(submitReviewDecision);
  const setReviewerFn = useServerFn(setReviewer);
  const setPctFn = useServerFn(setCompletionPercent);
  const addCommentFn = useServerFn(addComment);
  const resolveCommentFn = useServerFn(resolveComment);
  const watchFn = useServerFn(toggleWatcher);

  const duplicateFn = useServerFn(duplicateTask);
  const rateFn = useServerFn(rateTask);
  const logTimeFn = useServerFn(logTaskTime);
  const listAttachmentsFn = useServerFn(listTaskAttachments);
  const insertAttachmentFn = useServerFn(insertTaskAttachment);
  const deleteAttachmentFn = useServerFn(deleteTaskAttachment);
  const saveAssetLinksFn = useServerFn(updateTaskAssetLinks);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["task-detail", taskId ?? null], enabled: !!taskId,
    queryFn: () => detailFn({ data: { taskId: taskId! } }),
  });

  // Use the SECURITY DEFINER `list_assignable_users` RPC so employees (whose
  // profiles RLS only exposes themselves + direct reports) still see the full
  // active roster in the assignee/reviewer pickers — otherwise the Edit dialog
  // would show only the current user.
  const { data: peopleAll } = useQuery({
    queryKey: ["assignable-users-mini"],
    queryFn: async () => {
      const { data } = await supabase.rpc("list_assignable_users");
      return (data ?? []) as { id: string; full_name: string | null; email: string | null; department: string | null }[];
    },
  });

  // Only the assignee's reporting_manager_id is needed for the "rate this work"
  // manager check. RLS allows the reporting manager to read the assignee's row,
  // so this quietly returns null for everyone else — which is the intended gate.
  const assigneeIdForMgr = (detail?.task as { assignee_id?: string | null } | undefined)?.assignee_id ?? null;
  const { data: assigneeMgrId } = useQuery({
    queryKey: ["task-assignee-mgr", assigneeIdForMgr],
    enabled: !!assigneeIdForMgr,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("reporting_manager_id").eq("id", assigneeIdForMgr!).maybeSingle();
      return (data?.reporting_manager_id as string | null) ?? null;
    },
  });

  type Attachment = { id: string; task_id: string; uploader_id: string; file_path: string; file_name: string; content_type: string | null; size_bytes: number | null; created_at: string; url: string | null; uploader: { id: string; full_name: string | null; email: string | null } | null };
  const { data: attachmentsList } = useQuery({
    queryKey: ["task-attachments", taskId ?? null],
    enabled: !!taskId,
    queryFn: () => listAttachmentsFn({ data: { taskId: taskId! } }) as Promise<Attachment[]>,
  });
  const [uploadBusy, setUploadBusy] = useState(false);

  const [commentBody, setCommentBody] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [myDept, setMyDept] = useState<string | null>(null);
  const [refLabel, setRefLabel] = useState("");
  const [refUrl, setRefUrl] = useState("");
  const [refBusy, setRefBusy] = useState(false);
  const [markDoneOpen, setMarkDoneOpen] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [duplicateBusy, setDuplicateBusy] = useState(false);



  useEffect(() => {
    if (!me?.realId) { setMyDept(null); return; }
    supabase.from("profiles").select("department").eq("id", me.realId).maybeSingle()
      .then(({ data }) => setMyDept((data?.department as string | null) ?? null));
  }, [me?.realId]);

  // Auto-open mark-done when the sheet is opened with initialAction="mark-done"
  // (e.g. dropping a non-workflow card onto Done). Only fires once per taskId.
  const [autoTriggeredFor, setAutoTriggeredFor] = useState<string | null>(null);
  useEffect(() => {
    if (initialAction !== "mark-done" || !taskId || !detail?.task) return;
    if (autoTriggeredFor === taskId) return;
    const t = detail.task as { assignee_id: string | null; status: string; workflow_instance_id: string | null };
    if (t.workflow_instance_id) return; // workflow tasks use CloseStageDialog instead
    if (t.status === "done") return;
    if (t.assignee_id !== me?.id) return;
    setMarkDoneOpen(true);
    setAutoTriggeredFor(taskId);
  }, [initialAction, taskId, detail?.task, me?.id, autoTriggeredFor]);

  const task = detail?.task;
  const isAssignee = !!task && me?.id === task.assignee_id;
  const isReviewer = !!task && me?.id === (task as { reviewer_id: string | null }).reviewer_id;
  const isWatching = useMemo(
    () => !!detail?.watchers?.some((w) => (w as { user_id: string }).user_id === me?.id),
    [detail?.watchers, me?.id],
  );
  const subtasksExist = (detail?.subtasks?.length ?? 0) > 0;

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["task-detail", taskId] });
    await qc.invalidateQueries({ queryKey: ["task-attachments", taskId] });
    await qc.invalidateQueries({ queryKey: ["my-tasks"] });
    await qc.invalidateQueries({ queryKey: ["awaiting-my-review"] });
  }

  async function handleUploadFiles(files: FileList | null) {
    if (!files || !files.length || !taskId) return;
    setUploadBusy(true);
    let uploaded = 0;
    try {
      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `tasks/${taskId}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("task-attachments")
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (upErr) {
          console.error("[task-attachment] storage upload failed", { path, file: file.name, error: upErr });
          throw new Error(`Upload "${file.name}" failed: ${upErr.message}`);
        }
        try {
          await insertAttachmentFn({ data: {
            taskId, filePath: path, fileName: file.name,
            contentType: file.type || null, sizeBytes: file.size,
          }});
        } catch (insErr) {
          // Roll back the orphan storage object so the bucket doesn't fill with
          // files that have no metadata row (and no way to list/delete via UI).
          console.error("[task-attachment] metadata insert failed", { path, file: file.name, error: insErr });
          await supabase.storage.from("task-attachments").remove([path]).catch(() => {});
          throw new Error(`Save "${file.name}" failed: ${(insErr as Error).message}`);
        }
        uploaded += 1;
      }
      toast.success(uploaded === 1 ? "Attachment uploaded" : `${uploaded} attachments uploaded`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message, { duration: 10000 });
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleDeleteAttachment(id: string) {
    try {
      await deleteAttachmentFn({ data: { id } });
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  const assetLinks = ((task as { asset_links?: { label: string; url: string }[] | null } | undefined)?.asset_links) ?? [];

  async function saveAssetLinks(next: { label: string; url: string }[]) {
    if (!task) return;
    await saveAssetLinksFn({ data: { taskId: task.id, links: next } });
    await refresh();
  }
  async function addReference() {
    let url = refUrl.trim();
    if (!url) return toast.error("URL required");
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setRefBusy(true);
    try {
      await saveAssetLinks([...assetLinks, { label: refLabel.trim(), url }]);
      setRefLabel("");
      setRefUrl("");
    } catch (e) { toast.error((e as Error).message); }
    finally { setRefBusy(false); }
  }

  async function removeReference(idx: number) {
    try { await saveAssetLinks(assetLinks.filter((_, i) => i !== idx)); }
    catch (e) { toast.error((e as Error).message); }
  }


  async function doStatus(s: "todo" | "in_progress" | "review" | "done") {
    // Status transitions are free — no hours gate. Hours are captured in the
    // punch-out dialog. Review → Done still requires the reviewer's approval
    // (enforced server-side by setTaskStatus when a distinct reviewer is set).
    try {
      await setStatusFn({ data: { taskId: taskId!, status: s } });
      toast.success("Status updated");
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function confirmMarkDone(v: { hours: number; note?: string }) {
    try {
      if (v.hours && v.hours > 0) {
        await logTimeFn({ data: { taskId: taskId!, hours: v.hours, note: v.note ?? null } });
      }
      await setStatusFn({ data: { taskId: taskId!, status: "done" } });
      setMarkDoneOpen(false);
      toast.success(v.hours > 0 ? "Marked done — hours sent for approval" : "Marked done");
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function doReview(decision: "approve" | "request_changes" | "reject") {
    if (reviewBusy) return;
    setReviewBusy(true);
    try {
      await reviewFn({ data: { taskId: taskId!, decision, note: reviewNote.trim() || undefined } });
      setReviewNote("");
      toast.success("Review submitted");
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setReviewBusy(false); }
  }

  if (!taskId) return null;

  const canEditDelete = !!task && !!me && (
    me.isSuperAdmin || me.isAdmin ||
    (task as { created_by?: string }).created_by === me.realId ||
    (myDept ?? "").toLowerCase() === "marketing"
  );

  async function doDelete() {
    if (!task || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Task deleted");
      setDeleteOpen(false);
      onClose();
      await qc.invalidateQueries({ queryKey: ["mkt-kanban"] });
      await qc.invalidateQueries({ queryKey: ["my-tasks"] });
    } finally { setDeleteBusy(false); }
  }

  async function doDuplicate() {
    if (!task || duplicateBusy) return;
    setDuplicateBusy(true);
    try {
      const created = (await duplicateFn({ data: { id: task.id } })) as { id: string } | null;
      const newId = created?.id;
      if (!newId) throw new Error("Duplicate failed");
      toast.success("Task duplicated");
      await qc.invalidateQueries({ queryKey: ["mkt-kanban"] });
      await qc.invalidateQueries({ queryKey: ["my-tasks"] });
      onClose(newId);
    } catch (e) { toast.error((e as Error).message); }
    finally { setDuplicateBusy(false); }
  }


  return (
    <Sheet open={!!taskId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex items-start justify-between gap-2 pr-8">
            <SheetTitle className="font-display">{task?.title ?? (isLoading ? "Loading…" : "Task")}</SheetTitle>
            {!!task && !!me && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1"><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEditDelete && (
                    <DropdownMenuItem onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={doDuplicate} disabled={duplicateBusy}><Copy className="h-4 w-4 mr-2" />Duplicate</DropdownMenuItem>
                  {canEditDelete && <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                  </>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </SheetHeader>

        {task && (
          <>
            <div className="flex items-center flex-wrap gap-2 mb-4">
              <Badge variant="outline" className="capitalize">{task.priority}</Badge>
              <Select value={task.status} onValueChange={(v) => doStatus(v as "todo"|"in_progress"|"review"|"done")}>
                <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
              </Select>
              {task.review_state && task.review_state !== "none" && (
                <Badge variant="secondary" className="capitalize">{String(task.review_state).replace("_"," ")}</Badge>
              )}
              <div className="flex-1" />
              <Button size="sm" variant="ghost" onClick={async () => {
                await watchFn({ data: { taskId: taskId!, watching: !isWatching } });
                toast.success(isWatching ? "Stopped watching" : "Watching");
                await refresh();
              }}>
                {isWatching ? <BellOff className="h-4 w-4 mr-1" /> : <Bell className="h-4 w-4 mr-1" />}
                {isWatching ? "Unwatch" : "Watch"}
              </Button>
            </div>

            <div className="rounded-lg border border-border/60 p-3 mb-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>{task.completion_percent ?? 0}%</span>
              </div>
              <Progress value={task.completion_percent ?? 0} />
              {!subtasksExist && (isAssignee || isReviewer) && (
                <Slider
                  min={0} max={100} step={5}
                  value={[task.completion_percent ?? 0]}
                  onValueCommit={async (v) => {
                    await setPctFn({ data: { taskId: taskId!, percent: v[0] } });
                    await refresh();
                  }}
                />
              )}
              {subtasksExist && <p className="text-xs text-muted-foreground">Auto-computed from checklist</p>}
            </div>

            {isReviewer && task.status === "review" && !task.workflow_instance_id && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 mb-4 space-y-2">
                <div className="font-medium text-sm">Waiting for your review</div>
                <Textarea placeholder="Note to assignee (optional)" rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={() => doReview("approve")} disabled={reviewBusy} className="gradient-primary"><Check className="h-4 w-4 mr-1" />Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => doReview("request_changes")} disabled={reviewBusy}>Request changes</Button>
                  <Button size="sm" variant="destructive" onClick={() => doReview("reject")} disabled={reviewBusy}><X className="h-4 w-4 mr-1" />Reject</Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Assigned to</div>
                <div>{(task.assignee as { full_name?: string } | null)?.full_name ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Assigned by</div>
                <div>{(() => {
                  const cb = (task as { created_by?: string | null }).created_by;
                  const p = (peopleAll ?? []).find((x) => x.id === cb);
                  return p?.full_name ?? p?.email ?? "—";
                })()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Reviewer</div>
                <Select value={(task as { reviewer_id: string | null }).reviewer_id ?? "none"} onValueChange={async (v) => {
                  await setReviewerFn({ data: { taskId: taskId!, reviewerId: v === "none" ? null : v } });
                  toast.success("Reviewer updated");
                  await refresh();
                }}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Pick reviewer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {(peopleAll ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {task.due_date && <div><div className="text-xs text-muted-foreground mb-1">Due</div><div>{format(new Date(task.due_date as string), "MMM d, yyyy")}</div></div>}
              <div>
                <div className="text-xs text-muted-foreground mb-1">Project</div>
                <div>{(task.project as { name?: string } | null)?.name ?? "—"}</div>
              </div>
            </div>

            {(() => {
              const actingUserId = me?.id ?? null;
              const assigneeId = (task as { assignee_id: string | null }).assignee_id;
              const reviewerId = (task as { reviewer_id: string | null }).reviewer_id;
              const createdBy = (task as { created_by?: string | null }).created_by ?? null;
              const isManager = !!actingUserId && !!assigneeMgrId && assigneeMgrId === actingUserId;
              const canRate = !!actingUserId && !!assigneeId && actingUserId !== assigneeId
                && (reviewerId === actingUserId || createdBy === actingUserId || isManager);
              if (!canRate) return null;
              const current = (detail as { myRating?: number | null } | undefined)?.myRating ?? 0;
              return (
                <div className="rounded-lg border border-border/60 p-3 mb-4">
                  <div className="text-xs text-muted-foreground mb-1">Rate this work</div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n} type="button" className="p-1"
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                        onClick={async () => {
                          const next = current === n ? null : n;
                          try {
                            await rateFn({ data: { taskId: task.id, rating: next } });
                            toast.success(next == null ? "Rating cleared" : `Rated ${next}/5`);
                            await refresh();
                            await qc.invalidateQueries({ queryKey: ["my-performance"] });
                          } catch (e) { toast.error((e as Error).message); }
                        }}
                      >
                        <Star className={`h-5 w-5 ${n <= current ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                      </button>
                    ))}
                    {current > 0 && <span className="ml-2 text-xs text-muted-foreground">Your rating: {current}/5</span>}
                  </div>
                </div>
              );
            })()}

            {task.description && <p className="text-sm text-muted-foreground mb-4 whitespace-pre-wrap">{task.description}</p>}


            {task.workflow_instance_id && (
              <div className="mb-4">
                <WorkflowTaskPanel taskId={task.id} onChanged={refresh} onOpenTask={(id) => onClose(id)} />
              </div>
            )}

            <div className="space-y-3">
              <div className="text-sm font-semibold">Activity</div>

              {/* Inline affordances */}
              <div className="rounded-md border border-border/60 p-2 space-y-2 bg-muted/20">
                {/* Attachments */}
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium">Attachments</span>
                    <div className="flex-1" />
                    <label className="inline-flex">
                      <input
                        type="file" multiple className="hidden"
                        disabled={uploadBusy}
                        onChange={(e) => { void handleUploadFiles(e.target.files); e.currentTarget.value = ""; }}
                      />
                      <span className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs cursor-pointer hover:bg-accent">
                        {uploadBusy ? "Uploading…" : "Upload files"}
                      </span>
                    </label>
                  </div>
                  {(attachmentsList?.length ?? 0) === 0 ? (
                    <p className="pl-6 text-[11px] text-muted-foreground">No attachments yet.</p>
                  ) : (
                    <div className="pl-6 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(attachmentsList ?? []).map((a) => {
                        const isImg = (a.content_type ?? "").startsWith("image/");
                        const isVid = (a.content_type ?? "").startsWith("video/");
                        const canDelete = a.uploader_id === me?.id
                          || (task as { created_by?: string }).created_by === me?.realId
                          || !!me?.isAdmin || !!me?.isSuperAdmin;
                        return (
                          <div key={a.id} className="group relative rounded-md border border-border/60 overflow-hidden bg-muted/20 flex flex-col">
                            {isImg && a.url ? (
                              <a href={a.url} target="_blank" rel="noreferrer" className="block bg-black/5">
                                <img src={a.url} alt={a.file_name} className="w-full h-24 object-cover" />
                              </a>
                            ) : isVid && a.url ? (
                              <video src={a.url} controls className="w-full h-24 object-cover bg-black" />
                            ) : (
                              <a href={a.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center justify-center h-24 bg-muted/40">
                                <Paperclip className="h-6 w-6 text-muted-foreground" />
                              </a>
                            )}
                            <div className="px-2 py-1 text-[10px] flex items-center gap-1">
                              <a href={a.url ?? "#"} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline" title={a.file_name}>{a.file_name}</a>
                              {canDelete && (
                                <button className="text-muted-foreground hover:text-destructive" onClick={() => handleDeleteAttachment(a.id)} aria-label="Delete attachment">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                            <div className="px-2 pb-1 text-[10px] text-muted-foreground truncate">
                              {a.uploader?.full_name ?? a.uploader?.email ?? "Someone"} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Links */}
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <LinkIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium">Links</span>
                    <div className="flex-1" />
                  </div>
                  {assetLinks.length > 0 && (
                    <ul className="pl-6 space-y-1">
                      {assetLinks.map((r, i) => {
                        let fallback = r.url;
                        try { fallback = new URL(r.url).hostname.replace(/^www\./, "") + new URL(r.url).pathname.replace(/\/$/, ""); }
                        catch { fallback = r.url; }
                        const display = r.label.trim() || fallback;
                        return (
                          <li key={`${r.url}-${i}`} className="flex items-center gap-2 text-xs">
                            <a href={r.url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 truncate flex-1 min-w-0">
                              <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
                              <span className="truncate">{display}</span>
                            </a>
                            <button onClick={() => removeReference(i)} aria-label="Remove link" className="shrink-0">
                              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <Label className="text-[11px]">Label</Label>
                      <Input
                        placeholder="e.g. Figma file"
                        value={refLabel}
                        onChange={(e) => setRefLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addReference(); }}
                        className="h-8"
                      />
                    </div>
                    <div className="flex-[2] space-y-1">
                      <Label className="text-[11px]">Link</Label>
                      <Input
                        placeholder="https://…"
                        value={refUrl}
                        onChange={(e) => setRefUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addReference(); }}
                        className="h-8"
                      />
                    </div>
                    <div className="pt-5">
                      <Button size="sm" variant="outline" onClick={addReference} disabled={refBusy || !refUrl.trim()}>Add</Button>
                    </div>
                  </div>
                </div>

                {/* Watch toggle + current watchers */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={async () => {
                    await watchFn({ data: { taskId: taskId!, watching: !isWatching } });
                    toast.success(isWatching ? "Stopped watching" : "Watching");
                    await refresh();
                  }}>
                    {isWatching ? <BellOff className="h-3.5 w-3.5 mr-1" /> : <Bell className="h-3.5 w-3.5 mr-1" />}
                    {isWatching ? "Unwatch" : "Watch"}
                  </Button>
                  {(detail?.watchers?.length ?? 0) > 0 && (
                    <>
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {(detail?.watchers ?? []).map((w) => {
                          const ww = w as { user: { full_name?: string; email?: string } | null };
                          return ww.user?.full_name ?? ww.user?.email ?? "—";
                        }).join(", ")}
                      </span>
                    </>
                  )}
                </div>
              </div>


              {/* Unified timeline */}
              <div className="space-y-2">
                {(() => {
                  type Entry = { key: string; at: Date | null; actor: string; text: ReactNode; icon: ReactNode };
                  const entries: Entry[] = [];

                  for (const c of (detail?.comments ?? [])) {
                    const cc = c as { id: string; body: string; author: { full_name?: string } | null; created_at: string; resolved_at: string | null };
                    const attaches = (detail?.attachments ?? []).filter((a) => (a as { comment_id: string }).comment_id === cc.id);
                    entries.push({
                      key: `c-${cc.id}`, at: new Date(cc.created_at),
                      actor: cc.author?.full_name ?? "Someone",
                      icon: <MessageSquare className="h-3 w-3" />,
                      text: (
                        <span className={cc.resolved_at ? "opacity-60" : ""}>
                          <span className="text-muted-foreground">commented: </span>
                          <span className="whitespace-pre-wrap">{cc.body}</span>
                          {attaches.length > 0 && (
                            <span className="ml-2 inline-flex flex-wrap gap-2">
                              {attaches.map((a) => {
                                const aa = a as { id: string; url: string; label: string | null };
                                return <a key={aa.id} href={aa.url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{aa.label || "attachment"}</a>;
                              })}
                            </span>
                          )}
                          <button className="ml-2 text-[11px] text-muted-foreground hover:text-foreground" onClick={async () => {
                            await resolveCommentFn({ data: { commentId: cc.id, resolved: !cc.resolved_at } });
                            await refresh();
                          }}>{cc.resolved_at ? "Reopen" : "Resolve"}</button>
                        </span>
                      ),
                    });
                  }
                  // Checklist and dependency entries intentionally excluded from the
                  // timeline — comments here are plain notes, not task-management events.

                  for (const w of (detail?.watchers ?? [])) {
                    const ww = w as { id: string; created_at?: string; user: { full_name?: string; email?: string } | null };
                    entries.push({
                      key: `w-${ww.id}`, at: ww.created_at ? new Date(ww.created_at) : null,
                      actor: ww.user?.full_name ?? ww.user?.email ?? "Someone",
                      icon: <Users className="h-3 w-3" />,
                      text: <span className="text-muted-foreground">started watching</span>,
                    });
                  }
                  const nameFor = (id: string | null) => {
                    if (!id) return "Unassigned";
                    const p = (peopleAll ?? []).find((x) => x.id === id);
                    return p?.full_name ?? p?.email ?? "Someone";
                  };
                  for (const a of (detail?.activity ?? [])) {
                    const aa = a as { id: string; kind: string; actor: { full_name?: string } | null; from_value: string | null; to_value: string | null; note: string | null; created_at: string; hours: number | string | null };
                    let text: ReactNode;
                    if (aa.kind === "assignee_changed") {
                      text = aa.from_value
                        ? <span><span className="text-muted-foreground">reassigned from </span><span className="font-medium">{nameFor(aa.from_value)}</span><span className="text-muted-foreground"> to </span><span className="font-medium">{nameFor(aa.to_value)}</span></span>
                        : <span><span className="text-muted-foreground">assigned to </span><span className="font-medium">{nameFor(aa.to_value)}</span></span>;
                    } else {
                      text = (
                        <span>
                          <span className="text-muted-foreground">{aa.kind.replace(/_/g, " ")}</span>
                          {aa.from_value != null && aa.to_value != null && <span className="text-muted-foreground"> · {aa.from_value} → {aa.to_value}</span>}
                          {aa.hours != null && <span className="text-muted-foreground"> · {Number(aa.hours)}h</span>}
                          {aa.note && <span> · {aa.note}</span>}
                        </span>
                      );
                    }
                    entries.push({
                      key: `a-${aa.id}`, at: new Date(aa.created_at),
                      actor: aa.actor?.full_name ?? "System",
                      icon: <HistoryIcon className="h-3 w-3" />,
                      text,
                    });
                  }

                  const sorted = entries.sort((x, y) => {
                    const xt = x.at ? x.at.getTime() : 0;
                    const yt = y.at ? y.at.getTime() : 0;
                    return yt - xt;
                  });

                  const totalBurn = (detail?.activity ?? []).reduce((sum, a) => {
                    const h = (a as { hours: number | string | null }).hours;
                    return sum + (h == null ? 0 : Number(h));
                  }, 0);

                  return (
                    <>
                      {totalBurn > 0 && (
                        <div className="text-xs font-medium border rounded-md p-2 bg-muted/30">Total burn: {totalBurn}h</div>
                      )}
                      {sorted.map((e) => (
                        <div key={e.key} className="text-xs border-l-2 border-border pl-2 py-0.5 flex gap-2">
                          <span className="text-muted-foreground mt-0.5">{e.icon}</span>
                          <div className="flex-1 min-w-0">
                            {e.actor && <span className="font-medium">{e.actor} </span>}
                            {e.text}
                            {e.at && <span className="text-muted-foreground" title={format(e.at, "MMM d, yyyy HH:mm")}> · {formatDistanceToNow(e.at, { addSuffix: true })}</span>}
                          </div>
                        </div>
                      ))}
                      {sorted.length === 0 && <p className="text-xs text-muted-foreground">No activity yet.</p>}
                    </>
                  );
                })()}
              </div>

              {/* Add comment box at bottom */}
              <div className="space-y-2 pt-1">
                <Textarea placeholder="Add a comment. Use @name to mention." rows={3} value={commentBody} onChange={(e) => setCommentBody(e.target.value)} disabled={commentBusy} />
                <div className="flex justify-end">
                  <Button size="sm" disabled={commentBusy || !commentBody.trim()} onClick={async () => {
                    if (!commentBody.trim() || commentBusy) return;
                    setCommentBusy(true);
                    try {
                      const mentions: string[] = [];
                      const body = commentBody;
                      (peopleAll ?? []).forEach((p) => {
                        if (!p.full_name) return;
                        const re = new RegExp(`@${p.full_name.split(/\s+/)[0]}\\b`, "i");
                        if (re.test(body)) mentions.push(p.id);
                      });
                      await addCommentFn({ data: { taskId: taskId!, body, mentionUserIds: mentions } });
                      setCommentBody("");
                      await refresh();
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally { setCommentBusy(false); }
                  }}>{commentBusy ? "Posting…" : "Post"}</Button>
                </div>
              </div>
            </div>
          </>
        )}
        <EditTaskDialog
          open={editOpen}
          task={task ? {
            id: task.id,
            title: task.title,
            description: (task as { description?: string | null }).description ?? null,
            priority: task.priority as "low"|"medium"|"high",
            due_date: (task as { due_date?: string | null }).due_date ?? null,
            scheduled_post_date: (task as { scheduled_post_date?: string | null }).scheduled_post_date ?? null,
            
            project_id: (task as { project_id?: string | null }).project_id ?? null,
            assignee_id: (task as { assignee_id?: string | null }).assignee_id ?? null,
            asset_links: ((task as { asset_links?: { label: string; url: string }[] | null }).asset_links) ?? null,
            estimated_hours: (task as { estimated_hours?: number | null }).estimated_hours ?? null,
          } : null}
          roster={(peopleAll ?? []).map((p) => ({ id: p.id, full_name: p.full_name ?? null, email: p.email ?? null }))}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            await refresh();
            await qc.invalidateQueries({ queryKey: ["mkt-kanban"] });
          }}
        />
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this task?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the task and its comments, checklist, activity, and stage history. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={doDelete} disabled={deleteBusy}>{deleteBusy ? "Deleting…" : "Delete"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <MarkDoneDialog
          task={markDoneOpen && task ? {
            id: task.id, title: task.title,
            assigneeId: (task as { assignee_id?: string | null }).assignee_id ?? null,
            creatorId: (task as { created_by?: string | null }).created_by ?? null,
          } : null}
          onClose={() => setMarkDoneOpen(false)}
          onConfirm={(v) => confirmMarkDone({ hours: v.hours, note: v.note })}
        />
      </SheetContent>
    </Sheet>
  );
}
