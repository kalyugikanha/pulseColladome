import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Bell, BellOff, Check, X, MessageSquare, ListChecks, GitBranch, Users, History as HistoryIcon, Paperclip, Trash2, MoreVertical, Pencil, Workflow, Clock, Link as LinkIcon, ExternalLink } from "lucide-react";
import { EditTaskDialog } from "./edit-task-dialog";
import { WorkflowTaskPanel } from "./workflow-task-panel";
import {
  getTaskDetail, setTaskStatus, submitReviewDecision, setReviewer, setCompletionPercent,
  addSubtask, toggleSubtask, deleteSubtask, addComment, resolveComment,
  toggleWatcher, addDependency, removeDependency,
} from "@/lib/tasks-workflow.functions";
import { useCurrentUser } from "@/hooks/use-current-user";

type Props = { taskId: string | null; onClose: () => void };

const STATUS: Array<"todo" | "in_progress" | "review" | "done"> = ["todo", "in_progress", "review", "done"];
const STATUS_LABEL: Record<string, string> = { todo: "To Do", in_progress: "In Progress", review: "In Review", done: "Done" };

export function TaskDetailSheet({ taskId, onClose }: Props) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const detailFn = useServerFn(getTaskDetail);
  const setStatusFn = useServerFn(setTaskStatus);
  const reviewFn = useServerFn(submitReviewDecision);
  const setReviewerFn = useServerFn(setReviewer);
  const setPctFn = useServerFn(setCompletionPercent);
  const addSubFn = useServerFn(addSubtask);
  const toggleSubFn = useServerFn(toggleSubtask);
  const delSubFn = useServerFn(deleteSubtask);
  const addCommentFn = useServerFn(addComment);
  const resolveCommentFn = useServerFn(resolveComment);
  const watchFn = useServerFn(toggleWatcher);
  const addDepFn = useServerFn(addDependency);
  const rmDepFn = useServerFn(removeDependency);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["task-detail", taskId], enabled: !!taskId,
    queryFn: () => detailFn({ data: { taskId: taskId! } }),
  });

  const { data: peopleAll } = useQuery({
    queryKey: ["all-profiles-mini"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email, department").order("full_name")).data ?? [],
  });

  const [newSub, setNewSub] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [depQuery, setDepQuery] = useState("");
  const [depOptions, setDepOptions] = useState<{ id: string; title: string }[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [myDept, setMyDept] = useState<string | null>(null);
  const [refLabel, setRefLabel] = useState("");
  const [refUrl, setRefUrl] = useState("");
  const [refBusy, setRefBusy] = useState(false);



  useEffect(() => {
    if (!me?.realId) { setMyDept(null); return; }
    supabase.from("profiles").select("department").eq("id", me.realId).maybeSingle()
      .then(({ data }) => setMyDept((data?.department as string | null) ?? null));
  }, [me?.realId]);

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
    await qc.invalidateQueries({ queryKey: ["my-tasks"] });
    await qc.invalidateQueries({ queryKey: ["awaiting-my-review"] });
  }

  async function doStatus(s: "todo" | "in_progress" | "review" | "done") {
    try {
      await setStatusFn({ data: { taskId: taskId!, status: s } });
      toast.success("Status updated");
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function doReview(decision: "approve" | "request_changes" | "reject") {
    try {
      await reviewFn({ data: { taskId: taskId!, decision, note: reviewNote.trim() || undefined } });
      setReviewNote("");
      toast.success("Review submitted");
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function doSearchDeps(q: string) {
    setDepQuery(q);
    if (q.length < 2) { setDepOptions([]); return; }
    const { data } = await supabase.from("tasks").select("id, title").neq("id", taskId!).ilike("title", `%${q}%`).limit(10);
    setDepOptions(data ?? []);
  }

  if (!taskId) return null;

  const canEditDelete = !!task && !!me && (
    me.isSuperAdmin || me.isAdmin ||
    (task as { created_by?: string }).created_by === me.realId ||
    (myDept ?? "").toLowerCase() === "marketing"
  );

  async function doDelete() {
    if (!task) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Task deleted");
    setDeleteOpen(false);
    onClose();
    await qc.invalidateQueries({ queryKey: ["mkt-kanban"] });
    await qc.invalidateQueries({ queryKey: ["my-tasks"] });
  }

  return (
    <Sheet open={!!taskId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex items-start justify-between gap-2 pr-8">
            <SheetTitle className="font-display">{task?.title ?? (isLoading ? "Loading…" : "Task")}</SheetTitle>
            {canEditDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1"><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
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

            {isReviewer && task.status === "review" && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 mb-4 space-y-2">
                <div className="font-medium text-sm">Waiting for your review</div>
                <Textarea placeholder="Note to assignee (optional)" rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={() => doReview("approve")} className="gradient-primary"><Check className="h-4 w-4 mr-1" />Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => doReview("request_changes")}>Request changes</Button>
                  <Button size="sm" variant="destructive" onClick={() => doReview("reject")}><X className="h-4 w-4 mr-1" />Reject</Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Assignee</div>
                <div>{(task.assignee as { full_name?: string } | null)?.full_name ?? "—"}</div>
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

            {task.description && <p className="text-sm text-muted-foreground mb-4 whitespace-pre-wrap">{task.description}</p>}

            {task.workflow_instance_id && (
              <div className="mb-4">
                <WorkflowTaskPanel taskId={task.id} onChanged={refresh} />
              </div>
            )}

            <Tabs defaultValue="comments">
              <TabsList className="w-full flex-wrap h-auto">
                <TabsTrigger value="comments"><MessageSquare className="h-3.5 w-3.5 mr-1" />Comments</TabsTrigger>
                <TabsTrigger value="checklist"><ListChecks className="h-3.5 w-3.5 mr-1" />Checklist</TabsTrigger>
                <TabsTrigger value="deps"><GitBranch className="h-3.5 w-3.5 mr-1" />Dependencies</TabsTrigger>
                <TabsTrigger value="watchers"><Users className="h-3.5 w-3.5 mr-1" />Watchers</TabsTrigger>
                <TabsTrigger value="history"><HistoryIcon className="h-3.5 w-3.5 mr-1" />History</TabsTrigger>
              </TabsList>




              <TabsContent value="comments" className="space-y-3">
                <div className="space-y-2">
                  {(detail?.comments ?? []).map((c) => {
                    const cc = c as { id: string; body: string; author: { full_name?: string } | null; created_at: string; resolved_at: string | null };
                    const attaches = (detail?.attachments ?? []).filter((a) => (a as { comment_id: string }).comment_id === cc.id);
                    return (
                      <div key={cc.id} className={`rounded-md border border-border/60 p-2 ${cc.resolved_at ? "opacity-60" : ""}`}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{cc.author?.full_name ?? "Someone"}</span>
                          <span className="text-muted-foreground">{format(new Date(cc.created_at), "MMM d, HH:mm")}</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap mt-1">{cc.body}</p>
                        {attaches.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {attaches.map((a) => {
                              const aa = a as { id: string; url: string; label: string | null };
                              return <a key={aa.id} href={aa.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{aa.label || "attachment"}</a>;
                            })}
                          </div>
                        )}
                        <div className="mt-1">
                          <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={async () => {
                            await resolveCommentFn({ data: { commentId: cc.id, resolved: !cc.resolved_at } });
                            await refresh();
                          }}>{cc.resolved_at ? "Reopen" : "Resolve"}</button>
                        </div>
                      </div>
                    );
                  })}
                  {(detail?.comments?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
                </div>
                <Textarea placeholder="Add a comment. Use @name to mention." rows={3} value={commentBody} onChange={(e) => setCommentBody(e.target.value)} />
                <div className="flex justify-end">
                  <Button size="sm" onClick={async () => {
                    if (!commentBody.trim()) return;
                    // parse @mentions by full name against peopleAll
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
                  }}>Post</Button>
                </div>
              </TabsContent>

              <TabsContent value="checklist" className="space-y-2">
                {(detail?.subtasks ?? []).map((s) => {
                  const ss = s as { id: string; title: string; done: boolean };
                  return (
                    <div key={ss.id} className="flex items-center gap-2">
                      <Checkbox checked={ss.done} onCheckedChange={async (v) => {
                        await toggleSubFn({ data: { id: ss.id, done: !!v } });
                        await refresh();
                      }} />
                      <span className={`text-sm flex-1 ${ss.done ? "line-through text-muted-foreground" : ""}`}>{ss.title}</span>
                      <button className="text-muted-foreground hover:text-destructive" onClick={async () => {
                        await delSubFn({ data: { id: ss.id } });
                        await refresh();
                      }}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  );
                })}
                <div className="flex gap-2">
                  <Input placeholder="Add checklist item" value={newSub} onChange={(e) => setNewSub(e.target.value)}
                    onKeyDown={async (e) => { if (e.key === "Enter" && newSub.trim()) { await addSubFn({ data: { taskId: taskId!, title: newSub.trim() } }); setNewSub(""); await refresh(); } }} />
                  <Button size="sm" onClick={async () => { if (!newSub.trim()) return; await addSubFn({ data: { taskId: taskId!, title: newSub.trim() } }); setNewSub(""); await refresh(); }}>Add</Button>
                </div>
              </TabsContent>

              <TabsContent value="deps" className="space-y-2">
                {(detail?.dependencies ?? []).map((d) => {
                  const dd = d as { id: string; dep: { id: string; title: string; status: string } | null };
                  return (
                    <div key={dd.id} className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm">
                      <Badge variant="outline" className="capitalize">{dd.dep?.status}</Badge>
                      <span className="flex-1 truncate">{dd.dep?.title ?? "(deleted)"}</span>
                      <button className="text-muted-foreground hover:text-destructive" onClick={async () => {
                        await rmDepFn({ data: { id: dd.id } });
                        await refresh();
                      }}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  );
                })}
                <div>
                  <Input placeholder="Search task to depend on…" value={depQuery} onChange={(e) => doSearchDeps(e.target.value)} />
                  {depOptions.length > 0 && (
                    <div className="mt-1 border border-border/60 rounded-md max-h-40 overflow-y-auto">
                      {depOptions.map((o) => (
                        <button key={o.id} className="block w-full text-left px-2 py-1 text-sm hover:bg-accent"
                          onClick={async () => {
                            try {
                              await addDepFn({ data: { taskId: taskId!, dependsOnTaskId: o.id } });
                              setDepQuery(""); setDepOptions([]);
                              await refresh();
                            } catch (e) { toast.error((e as Error).message); }
                          }}>{o.title}</button>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="watchers" className="space-y-1">
                {(detail?.watchers ?? []).map((w) => {
                  const ww = w as { id: string; user: { full_name?: string; email?: string } | null };
                  return <div key={ww.id} className="text-sm">{ww.user?.full_name ?? ww.user?.email ?? "—"}</div>;
                })}
                {(detail?.watchers?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">Nobody is watching yet.</p>}
              </TabsContent>

              <TabsContent value="history" className="space-y-2">
                {(() => {
                  const acts = (detail?.activity ?? []) as Array<{ id: string; kind: string; actor: { full_name?: string } | null; from_value: string | null; to_value: string | null; note: string | null; created_at: string; hours: number | string | null }>;
                  const totalBurn = acts.reduce((s, a) => s + (a.hours == null ? 0 : Number(a.hours)), 0);
                  return (
                    <>
                      {totalBurn > 0 && (
                        <div className="text-xs font-medium border rounded-md p-2 bg-muted/30">
                          Total burn: {totalBurn}h
                        </div>
                      )}
                      {acts.map((aa) => (
                        <div key={aa.id} className="text-xs border-l-2 border-border pl-2 py-0.5">
                          <span className="font-medium">{aa.actor?.full_name ?? "System"}</span>{" "}
                          <span className="text-muted-foreground">{aa.kind.replace(/_/g, " ")}</span>
                          {aa.from_value != null && aa.to_value != null && <span className="text-muted-foreground"> · {aa.from_value} → {aa.to_value}</span>}
                          {aa.hours != null && <span className="text-muted-foreground"> · {Number(aa.hours)}h</span>}
                          {aa.note && <span className="text-muted-foreground"> · {aa.note}</span>}
                          <span className="text-muted-foreground"> · {format(new Date(aa.created_at), "MMM d HH:mm")}</span>
                        </div>
                      ))}
                      {acts.length === 0 && <p className="text-xs text-muted-foreground">No activity yet.</p>}
                    </>
                  );
                })()}
              </TabsContent>
            </Tabs>
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
            client_brand: (task as { client_brand?: string | null }).client_brand ?? null,
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
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={doDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
