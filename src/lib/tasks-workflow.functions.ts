import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type TaskStatus = "todo" | "in_progress" | "review" | "done";

async function logActivity(
  supabase: { from: (t: string) => { insert: (v: unknown) => Promise<{ error: unknown }> } },
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
  supabase: { from: (t: string) => { insert: (v: unknown) => Promise<{ error: unknown }> } },
  userId: string, kind: string, taskId: string | null, commentId: string | null, body: string,
) {
  if (!userId) return;
  await supabase.from("notifications").insert({
    user_id: userId, kind, task_id: taskId, comment_id: commentId, body,
  });
}

/* ============ Task detail read ============ */
export const getTaskDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [task, subtasks, activity, comments, attachments, watchers, deps] = await Promise.all([
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
    ]);
    return {
      task: task.data, subtasks: subtasks.data ?? [], activity: activity.data ?? [],
      comments: comments.data ?? [], attachments: attachments.data ?? [],
      watchers: watchers.data ?? [], dependencies: deps.data ?? [],
    };
  });

/* ============ Status / review workflow ============ */
export const setTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string; status: TaskStatus }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task } = await supabase.from("tasks").select("id, status, reviewer_id, assignee_id, review_state").eq("id", data.taskId).maybeSingle();
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

    let nextStatus: TaskStatus = data.status;
    let reviewState: string = task.review_state;
    // Assignee marking done + reviewer set → move to review
    if (data.status === "done" && task.reviewer_id && task.reviewer_id !== userId) {
      nextStatus = "review";
      reviewState = "pending_review";
    } else if (data.status !== "done") {
      reviewState = "none";
    }

    const { error } = await supabase.from("tasks").update({
      status: nextStatus, review_state: reviewState,
    }).eq("id", data.taskId);
    if (error) throw error;
    await logActivity(supabase, data.taskId, userId, "status_changed", task.status, nextStatus);

    if (nextStatus === "review" && task.reviewer_id) {
      await notify(supabase, task.reviewer_id, "review_requested", data.taskId, null, "A task is waiting for your review.");
    }
    return { ok: true, status: nextStatus, review_state: reviewState };
  });

export const submitReviewDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string; decision: "approve" | "request_changes" | "reject"; note?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task } = await supabase.from("tasks").select("id, status, reviewer_id, assignee_id").eq("id", data.taskId).maybeSingle();
    if (!task) throw new Error("Task not found");
    if (task.reviewer_id !== userId) throw new Error("Not the reviewer");

    let nextStatus: TaskStatus = "done";
    let reviewState: string = "approved";
    let notifBody = "Your task was approved.";
    if (data.decision === "request_changes") { nextStatus = "in_progress"; reviewState = "changes_requested"; notifBody = "Reviewer requested changes."; }
    if (data.decision === "reject") { nextStatus = "todo"; reviewState = "changes_requested"; notifBody = "Your task was rejected."; }

    const { error } = await supabase.from("tasks").update({
      status: nextStatus, review_state: reviewState,
    }).eq("id", data.taskId);
    if (error) throw error;
    await logActivity(supabase, data.taskId, userId, "review_submitted", task.status, `${nextStatus}:${data.decision}`, data.note ?? null);
    if (task.assignee_id) await notify(supabase, task.assignee_id, "review_decided", data.taskId, null, notifBody + (data.note ? ` — ${data.note}` : ""));
    return { ok: true };
  });

export const setReviewer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string; reviewerId: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prev } = await supabase.from("tasks").select("reviewer_id").eq("id", data.taskId).maybeSingle();
    const { error } = await supabase.from("tasks").update({ reviewer_id: data.reviewerId }).eq("id", data.taskId);
    if (error) throw error;
    await logActivity(supabase, data.taskId, userId, "reviewer_changed", prev?.reviewer_id ?? null, data.reviewerId);
    if (data.reviewerId) await notify(supabase, data.reviewerId, "reviewer_assigned", data.taskId, null, "You were added as reviewer on a task.");
    return { ok: true };
  });

/* ============ Completion percent ============ */
export const setCompletionPercent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; done: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("task_subtasks").update({ done: data.done }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteSubtask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("task_subtasks").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ============ Comments ============ */
export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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

/* ============ Dependencies ============ */
export const addDependency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("task_dependencies").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ============ Awaiting-my-review list ============ */
export const listAwaitingMyReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
