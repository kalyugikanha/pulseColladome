import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { impersonationMiddleware } from "./impersonation.middleware";

type TaskStatus = "todo" | "in_progress" | "review" | "done";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function logActivity(
  supabase: any,
  taskId: string,
  actorId: string,
  kind: string,
  fromValue: string | null,
  toValue: string | null,
  note: string | null = null,
) {
  await supabase.from("task_activity").insert({
    task_id: taskId, actor_id: actorId, kind,
    from_value: fromValue, to_value: toValue, note,
  });
}

async function notify(
  supabase: any,
  userId: string, kind: string, taskId: string | null, commentId: string | null, body: string,
) {
  if (!userId) return;
  await supabase.from("notifications").insert({
    user_id: userId, kind, task_id: taskId, comment_id: commentId, body,
  });
}


/* ============ Task detail read ============ */
export const getTaskDetail = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskId: string}) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const actingUserId = context.actingUserId;
    const [task, subtasks, activity, comments, attachments, watchers, deps, myRating] = await Promise.all([
      supabase.from("tasks").select(`
        *,
        assignee:profiles!tasks_assignee_profile_fkey(id, full_name, email),
        reviewer:profiles!tasks_reviewer_id_fkey(id, full_name, email),
        project:projects(id, name)
      `).eq("id", data.taskId).maybeSingle(),
      supabase.from("task_subtasks").select("*").eq("task_id", data.taskId).order("position"),
      supabase.from("task_activity").select("*, actor:profiles!task_activity_actor_id_fkey(id, full_name)").eq("task_id", data.taskId).order("created_at", { ascending: false }),
      supabase.from("task_comments").select("*, author:profiles!task_comments_author_id_fkey(id, full_name, email)").eq("task_id", data.taskId).order("created_at"),
      supabase.from("task_comment_attachments").select("*, comment:task_comments!inner(task_id)").eq("comment.task_id", data.taskId),
      supabase.from("task_watchers").select("*, user:profiles!task_watchers_user_id_fkey(id, full_name, email)").eq("task_id", data.taskId),
      supabase.from("task_dependencies").select("*, dep:tasks!task_dependencies_depends_on_task_id_fkey(id, title, status)").eq("task_id", data.taskId),
      supabase.from("task_ratings").select("rating").eq("task_id", data.taskId).eq("rater_id", actingUserId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return {
      task: task.data, subtasks: subtasks.data ?? [], activity: activity.data ?? [],
      comments: comments.data ?? [], attachments: attachments.data ?? [],
      watchers: watchers.data ?? [], dependencies: deps.data ?? [],
      myRating: (myRating.data as { rating: number } | null)?.rating ?? null,
    };
  });

/* ============ Rate a task ============ */
export const rateTask = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskId: string; rating: number | null}) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const actingUserId = context.actingUserId;
    const { data: t, error: tErr } = await supabase
      .from("tasks")
      .select("id, assignee_id, reviewer_id, created_by")
      .eq("id", data.taskId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!t) throw new Error("Task not found");
    const task = t as { id: string; assignee_id: string | null; reviewer_id: string | null; created_by: string };
    if (!task.assignee_id) throw new Error("Task has no assignee to rate.");
    if (task.assignee_id === actingUserId) throw new Error("You can't rate your own work.");

    // Authorisation: reviewer, creator, or the assignee's reporting manager.
    let allowed = task.reviewer_id === actingUserId || task.created_by === actingUserId;
    if (!allowed) {
      const { data: prof } = await supabase.from("profiles").select("reporting_manager_id").eq("id", task.assignee_id).maybeSingle();
      if ((prof as { reporting_manager_id: string | null } | null)?.reporting_manager_id === actingUserId) allowed = true;
    }
    if (!allowed) throw new Error("You are not allowed to rate this task.");

    // Clear any previous rating from this rater, then insert (or leave cleared if rating is null).
    const { error: delErr } = await supabase.from("task_ratings").delete()
      .eq("task_id", task.id).eq("rater_id", actingUserId);
    if (delErr) throw delErr;

    if (data.rating != null) {
      const r = Math.round(data.rating);
      if (r < 1 || r > 5) throw new Error("Rating must be 1–5.");
      const { error: insErr } = await supabase.from("task_ratings").insert({
        task_id: task.id, ratee_id: task.assignee_id, rater_id: actingUserId, rating: r,
      });
      if (insErr) throw insErr;
    }
    return { ok: true, rating: data.rating };
  });


/* ============ Status / review workflow ============ */
export const setTaskStatus = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskId: string; status: TaskStatus}) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const actingUserId = context.actingUserId;
    const { data: task } = await supabase.from("tasks").select("id, status, reviewer_id, assignee_id, review_state, created_by, workflow_instance_id").eq("id", data.taskId).maybeSingle();
    if (!task) throw new Error("Task not found");

    // Dependency gate: cannot leave 'todo' if any dep is not done
    if (task.status === "todo" && data.status !== "todo") {
      const { data: deps } = await supabase
        .from("task_dependencies")
        .select("dep:tasks!task_dependencies_depends_on_task_id_fkey(status)")
        .eq("task_id", data.taskId);
      const blocking = (deps ?? []).some((d) => {
        const s = (d.dep as { status?: string } | null)?.status;
        return s && s !== "done";
      });
      if (blocking) throw new Error("This task is blocked by an incomplete dependency.");
    }

    // Default reviewer to the ORIGINAL CREATOR of the task when moving to done
    // and no reviewer has been explicitly set. Only used as a default — never overwrites.
    let reviewerId: string | null = task.reviewer_id ?? null;
    if (data.status === "done" && !reviewerId && task.created_by && task.created_by !== actingUserId) {
      reviewerId = task.created_by;
      await supabase.from("tasks").update({ reviewer_id: reviewerId }).eq("id", data.taskId);
    }

    let nextStatus: TaskStatus = data.status;
    let reviewState: string = task.review_state;
    // Assignee marking done + reviewer set → move to review
    if (data.status === "done" && reviewerId && reviewerId !== actingUserId) {
      nextStatus = "review";
      reviewState = "pending_review";
    } else if (data.status !== "done") {
      reviewState = "none";
    }

    // Hours-before-review gate REMOVED: hours are captured in the punch-out dialog now.
    // Status transitions between todo / in_progress / review are self-service.

    const { error } = await supabase.from("tasks").update({
      status: nextStatus, review_state: reviewState,
    }).eq("id", data.taskId);
    if (error) throw error;
    await logActivity(supabase, data.taskId, actingUserId, "status_changed", task.status, nextStatus);

    if (nextStatus === "review" && reviewerId) {
      await notify(supabase, reviewerId, "review_requested", data.taskId, null, "A task is waiting for your review.");
    }
    return { ok: true, status: nextStatus, review_state: reviewState };
  });

export const submitReviewDecision = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskId: string; decision: "approve" | "request_changes" | "reject"; note?: string}) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const actingUserId = context.actingUserId;
    const { data: task } = await supabase.from("tasks").select("id, status, reviewer_id, assignee_id").eq("id", data.taskId).maybeSingle();
    if (!task) throw new Error("Task not found");
    if (task.reviewer_id !== actingUserId) throw new Error("Not the reviewer");

    let nextStatus: TaskStatus = "done";
    let reviewState: string = "approved";
    let notifBody = "Your task was approved.";
    if (data.decision === "request_changes") { nextStatus = "in_progress"; reviewState = "changes_requested"; notifBody = "Reviewer requested changes."; }
    if (data.decision === "reject") { nextStatus = "todo"; reviewState = "changes_requested"; notifBody = "Your task was rejected."; }

    const { error } = await supabase.from("tasks").update({
      status: nextStatus, review_state: reviewState,
    }).eq("id", data.taskId);
    if (error) throw error;
    await logActivity(supabase, data.taskId, actingUserId, "review_submitted", task.status, `${nextStatus}:${data.decision}`, data.note ?? null);
    if (task.assignee_id) await notify(supabase, task.assignee_id, "review_decided", data.taskId, null, notifBody + (data.note ? ` — ${data.note}` : ""));
    return { ok: true };
  });

export const setReviewer = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskId: string; reviewerId: string | null}) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const actingUserId = context.actingUserId;
    const { data: prev } = await supabase.from("tasks").select("reviewer_id").eq("id", data.taskId).maybeSingle();
    const { error } = await supabase.from("tasks").update({ reviewer_id: data.reviewerId }).eq("id", data.taskId);
    if (error) throw error;
    await logActivity(supabase, data.taskId, actingUserId, "reviewer_changed", prev?.reviewer_id ?? null, data.reviewerId);
    if (data.reviewerId) await notify(supabase, data.reviewerId, "reviewer_assigned", data.taskId, null, "You were added as reviewer on a task.");
    return { ok: true };
  });

/** Update editable task fields; logs assignee_changed to task_activity when it changes. */
export const updateTaskFields = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: {
    taskId: string;
    patch: {
      title?: string;
      description?: string | null;
      priority?: "low" | "medium" | "high";
      due_date?: string | null;
      scheduled_post_date?: string | null;
      client_brand?: string | null;
      project_id?: string | null;
      assignee_id?: string | null;
      asset_links?: { label: string; url: string }[];
      estimated_hours?: number | null;
    };
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const actingUserId = context.actingUserId;
    const { data: prev } = await supabase.from("tasks").select("assignee_id, title").eq("id", data.taskId).maybeSingle();
    if (!prev) throw new Error("Task not found");
    const { error } = await supabase.from("tasks").update(data.patch as never).eq("id", data.taskId);
    if (error) throw error;
    const newAssignee = data.patch.assignee_id ?? null;
    const oldAssignee = (prev as { assignee_id: string | null }).assignee_id ?? null;
    if ("assignee_id" in data.patch && newAssignee !== oldAssignee) {
      await logActivity(supabase, data.taskId, actingUserId, "assignee_changed", oldAssignee, newAssignee);
      if (newAssignee && newAssignee !== actingUserId) {
        await notify(supabase, newAssignee, "task_assigned", data.taskId, null,
          `You were assigned to "${(prev as { title: string }).title}".`);
      }
    }
    return { ok: true };
  });

/** Save task reference links (asset_links) for any user who can view the task.
 *  Uses admin client to bypass tasks-table UPDATE RLS after an explicit
 *  can_view_task() authorization check, so creators/watchers/etc. can add
 *  references without needing write access to the whole row. */
export const updateTaskAssetLinks = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskId: string; links: { label: string; url: string }[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const actingUserId = context.actingUserId;
    const clean = (data.links ?? [])
      .map((l) => ({ label: String(l.label ?? "").trim(), url: String(l.url ?? "").trim() }))
      .filter((l) => l.url.length > 0);

    const { data: canView, error: canErr } = await supabase.rpc("can_view_task", { _task_id: data.taskId });
    if (canErr) throw canErr;
    if (!canView) throw new Error("You can't edit this task.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tasks")
      .update({ asset_links: clean as never } as never)
      .eq("id", data.taskId);
    if (error) throw error;

    await logActivity(supabaseAdmin, data.taskId, actingUserId, "references_updated", null, null,
      `${clean.length} reference${clean.length === 1 ? "" : "s"}`);
    return { ok: true, links: clean };
  });

/** Reprioritize a card on the Kanban board. Optionally moves it to a new column.
 *  Auth: relies on tasks-table UPDATE RLS (assignee, reviewer, project manager,
 *  dept head, reporting manager). 0 rows updated → clear "no permission" error. */
export const reorderKanbanCard = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: {
    taskId: string;
    manualRank: number | null;
    status?: "todo" | "in_progress" | "review" | "done";
  }) => d)
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { manual_rank: data.manualRank };
    if (data.status) patch.status = data.status;
    const { data: rows, error } = await context.supabase
      .from("tasks").update(patch as never).eq("id", data.taskId).select("id");
    if (error) throw error;
    if (!rows || rows.length === 0) {
      throw new Error("You don't have permission to reorder this task.");
    }
    return { ok: true };
  });

/** Clear manual_rank for a list of tasks (best-effort — only rows the caller can update change). */
export const clearManualRank = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskIds: string[] }) => d)
  .handler(async ({ data, context }) => {
    if (!data.taskIds.length) return { ok: true, cleared: 0 };
    const { data: rows, error } = await context.supabase
      .from("tasks").update({ manual_rank: null } as never).in("id", data.taskIds).select("id");
    if (error) throw error;
    return { ok: true, cleared: rows?.length ?? 0 };
  });

/** Sort a column's tasks by due date (asc, nulls last, priority tiebreaker) and
 *  write evenly-spaced manual_rank values so drag reorder still has room to insert
 *  between neighbors. RLS silently skips tasks the caller can't update. */
export const sortColumnByDueDate = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskIds: string[] }) => d)
  .handler(async ({ data, context }) => {
    if (!data.taskIds.length) return { ok: true, updated: 0, skipped: 0 };
    const { data: rows, error: readErr } = await context.supabase
      .from("tasks")
      .select("id, due_date, priority, created_at")
      .in("id", data.taskIds);
    if (readErr) throw readErr;
    const priRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const sorted = ((rows ?? []) as Array<{ id: string; due_date: string | null; priority: string; created_at: string | null }>)
      .slice()
      .sort((a, b) => {
        const da = a.due_date ? new Date(a.due_date).getTime() : null;
        const db = b.due_date ? new Date(b.due_date).getTime() : null;
        if (da === null && db === null) {
          const pa = priRank[a.priority] ?? 99, pb = priRank[b.priority] ?? 99;
          if (pa !== pb) return pa - pb;
          return (b.created_at ? new Date(b.created_at).getTime() : 0) - (a.created_at ? new Date(a.created_at).getTime() : 0);
        }
        if (da === null) return 1;
        if (db === null) return -1;
        if (da !== db) return da - db;
        const pa = priRank[a.priority] ?? 99, pb = priRank[b.priority] ?? 99;
        return pa - pb;
      });

    let updated = 0;
    for (let i = 0; i < sorted.length; i++) {
      const rank = 1024 * (i + 1);
      const { data: upd, error } = await context.supabase
        .from("tasks").update({ manual_rank: rank } as never).eq("id", sorted[i].id).select("id");
      if (error) throw error;
      if (upd && upd.length) updated += 1;
    }
    return { ok: true, updated, skipped: sorted.length - updated };
  });

/* ============ Completion percent ============ */
export const setCompletionPercent = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskId: string; percent: number }) => d)
  .handler(async ({ data, context }) => {
    const p = Math.max(0, Math.min(100, Math.round(data.percent)));
    const { supabase, userId } = context;
    const { data: prev } = await supabase.from("tasks").select("completion_percent").eq("id", data.taskId).maybeSingle();
    const { error } = await supabase.from("tasks").update({ completion_percent: p }).eq("id", data.taskId);
    if (error) throw error;
    await logActivity(supabase, data.taskId, userId, "percent_changed", String(prev?.completion_percent ?? 0), String(p));
    return { ok: true, percent: p };
  });

/* ============ Subtasks ============ */
export const addSubtask = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskId: string; title: string }) => d)
  .handler(async ({ data, context }) => {
    const title = data.title.trim();
    if (!title) throw new Error("Title required");
    const { supabase } = context;
    const { data: last } = await supabase.from("task_subtasks").select("position").eq("task_id", data.taskId).order("position", { ascending: false }).limit(1).maybeSingle();
    const pos = ((last?.position ?? -1) as number) + 1;
    const { data: row, error } = await supabase.from("task_subtasks").insert({
      task_id: data.taskId, title, position: pos,
    }).select("*").single();
    if (error) throw error;
    return row;
  });

export const toggleSubtask = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { id: string; done: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("task_subtasks").update({ done: data.done }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteSubtask = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("task_subtasks").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ============ Comments ============ */
export const addComment = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskId: string; body: string; parentId?: string | null; mentionUserIds?: string[]; attachments?: { url: string; label?: string; kind: "file" | "link" }[] }) => d)
  .handler(async ({ data, context }) => {
    const body = data.body.trim();
    if (!body) throw new Error("Empty comment");
    const { supabase, userId } = context;
    const { data: row, error } = await supabase.from("task_comments").insert({
      task_id: data.taskId, author_id: userId, body, parent_id: data.parentId ?? null,
    }).select("*").single();
    if (error) throw error;

    if (data.attachments?.length) {
      await supabase.from("task_comment_attachments").insert(
        data.attachments.map((a) => ({ comment_id: row.id, url: a.url, label: a.label ?? null, kind: a.kind })),
      );
    }
    const mentionIds = Array.from(new Set(data.mentionUserIds ?? []));
    if (mentionIds.length) {
      await supabase.from("task_mentions").insert(
        mentionIds.map((uid) => ({ comment_id: row.id, task_id: data.taskId, mentioned_user_id: uid })),
      );
      await Promise.all(mentionIds.map((uid) =>
        notify(supabase, uid, "mentioned", data.taskId, row.id, "You were mentioned in a comment.")));
    }
    await logActivity(supabase, data.taskId, userId, "comment_added", null, row.id);
    return row;
  });

export const resolveComment = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { commentId: string; resolved: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch = data.resolved
      ? { resolved_at: new Date().toISOString(), resolved_by: userId }
      : { resolved_at: null, resolved_by: null };
    const { error } = await supabase.from("task_comments").update(patch).eq("id", data.commentId);
    if (error) throw error;
    return { ok: true };
  });

/* ============ Watchers ============ */
export const toggleWatcher = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskId: string; watching: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.watching) {
      const { error } = await supabase.from("task_watchers").insert({ task_id: data.taskId, user_id: userId });
      if (error && !String(error.message).includes("duplicate")) throw error;
    } else {
      await supabase.from("task_watchers").delete().eq("task_id", data.taskId).eq("user_id", userId);
    }
    return { ok: true };
  });

/* ============ Task attachments ============ */
export const listTaskAttachments = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("task_attachments")
      .select("*")
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const items = (rows ?? []) as any[];
    const uploaderIds = Array.from(new Set(items.map((r) => r.uploader_id).filter(Boolean)));
    const profilesMap = new Map<string, { id: string; full_name: string | null; email: string | null }>();
    if (uploaderIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", uploaderIds);
      (profs ?? []).forEach((p: any) => profilesMap.set(p.id, p));
    }
    const withUrls = await Promise.all(
      items.map(async (r: any) => {
        const { data: signed } = await supabase.storage
          .from("task-attachments")
          .createSignedUrl(r.file_path as string, 60 * 10);
        return { ...r, url: signed?.signedUrl ?? null, uploader: profilesMap.get(r.uploader_id) ?? null };
      }),
    );
    return withUrls;
  });

export const insertTaskAttachment = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskId: string; filePath: string; fileName: string; contentType?: string | null; sizeBytes?: number | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const actingUserId = context.actingUserId;
    const { data: row, error } = await supabase.from("task_attachments").insert({
      task_id: data.taskId,
      uploader_id: actingUserId,
      file_path: data.filePath,
      file_name: data.fileName,
      content_type: data.contentType ?? null,
      size_bytes: data.sizeBytes ?? null,
    }).select("*").single();
    if (error) throw error;
    await logActivity(supabase, data.taskId, actingUserId, "attachment_added", null, data.fileName);
    return row;
  });

export const deleteTaskAttachment = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const actingUserId = context.actingUserId;
    const { data: row, error: rErr } = await supabase.from("task_attachments").select("*").eq("id", data.id).maybeSingle();
    if (rErr) throw rErr;
    if (!row) throw new Error("Attachment not found");
    const { error: dErr } = await supabase.from("task_attachments").delete().eq("id", data.id);
    if (dErr) throw dErr;
    await supabase.storage.from("task-attachments").remove([row.file_path as string]);
    await logActivity(supabase, row.task_id as string, actingUserId, "attachment_removed", row.file_name as string, null);
    return { ok: true };
  });

/* ============ Dependencies ============ */
export const addDependency = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskId: string; dependsOnTaskId: string }) => d)
  .handler(async ({ data, context }) => {
    if (data.taskId === data.dependsOnTaskId) throw new Error("Cannot depend on itself");
    // simple 1-level cycle guard
    const { data: rev } = await context.supabase.from("task_dependencies")
      .select("id").eq("task_id", data.dependsOnTaskId).eq("depends_on_task_id", data.taskId).maybeSingle();
    if (rev) throw new Error("Would create a dependency cycle");
    const { error } = await context.supabase.from("task_dependencies").insert({
      task_id: data.taskId, depends_on_task_id: data.dependsOnTaskId,
    });
    if (error) throw error;
    return { ok: true };
  });

export const removeDependency = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("task_dependencies").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ============ Awaiting-my-review list ============ */
export const listAwaitingMyReview = createServerFn({ method: "GET" })
  .middleware([impersonationMiddleware])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("tasks")
      .select("id, title, priority, due_date, completion_percent, assignee:profiles!tasks_assignee_profile_fkey(id, full_name), project:projects(id, name)")
      .eq("reviewer_id", context.userId)
      .eq("status", "review")
      .order("updated_at", { ascending: false });
    return data ?? [];
  });

/* ============ Notifications ============ */
export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([impersonationMiddleware])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("notifications")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    return data ?? [];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { ids?: string[]; all?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.all) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() })
        .eq("user_id", userId).is("read_at", null);
    } else if (data.ids?.length) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() })
        .eq("user_id", userId).in("id", data.ids);
    }
    return { ok: true };
  });
