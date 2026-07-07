import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Types shared with the client */
export type WorkflowRequiredField = {
  key: string;
  kind: "text" | "url" | "attachment";
  label: string;
  required?: boolean;
};
export type WorkflowBranchOption = { key: string; label: string };
export type WorkflowStageInput = {
  id?: string;
  position: number;
  name: string;
  requires_review: boolean;
  default_assignee_id: string | null;
  default_reviewer_id: string | null;
  default_due_offset_days: number | null;
  required_fields: WorkflowRequiredField[];
  branch_options: WorkflowBranchOption[];
  branch_target_map: Record<string, number>;
  next_stage_position: number | null;
};

/** List all templates + stages. */
export const listWorkflowTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [t, s] = await Promise.all([
      supabase.from("workflow_templates" as never).select("*").order("name"),
      supabase.from("workflow_template_stages" as never).select("*").order("position"),
    ]);
    const templates = ((t.data as unknown as Array<{ id: string; name: string; description: string | null; department: string | null; is_active: boolean }>) ?? []);
    const stages = ((s.data as unknown as Array<WorkflowStageInput & { id: string; template_id: string }>) ?? []);
    return templates.map((tpl) => ({
      ...tpl,
      stages: stages.filter((st) => st.template_id === tpl.id).sort((a, b) => a.position - b.position),
    }));
  });

/** Admin CRUD. Replaces the template's stages atomically. */
export const saveWorkflowTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string; name: string; description?: string | null; department?: string | null;
    is_active?: boolean; stages: WorkflowStageInput[];
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!data.name.trim()) throw new Error("Name required");
    if (data.stages.length === 0) throw new Error("At least one stage required");
    // Validate branch targets exist as positions
    for (const s of data.stages) {
      for (const k of Object.keys(s.branch_target_map)) {
        const pos = s.branch_target_map[k];
        if (!data.stages.some((x) => x.position === pos)) {
          throw new Error(`Branch "${k}" on stage ${s.position} points to missing stage ${pos}`);
        }
        if (pos <= s.position) throw new Error(`Branch target must come after stage ${s.position}`);
        if (!s.branch_options.some((b) => b.key === k)) {
          throw new Error(`Branch target key "${k}" has no matching option on stage ${s.position}`);
        }
      }
    }
    const payload = {
      name: data.name.trim(),
      description: data.description ?? null,
      department: data.department ?? null,
      is_active: data.is_active ?? true,
      created_by: context.userId,
    };
    let id = data.id;
    if (id) {
      const { error } = await supabase.from("workflow_templates" as never).update(payload as never).eq("id", id);
      if (error) throw error;
    } else {
      const { data: row, error } = await supabase.from("workflow_templates" as never).insert(payload as never).select("id").single();
      if (error) throw error;
      id = (row as unknown as { id: string }).id;
    }
    // Wipe and re-insert stages (safe: no tasks reference stages directly)
    await supabase.from("workflow_template_stages" as never).delete().eq("template_id", id!);
    await supabase.from("workflow_template_stages" as never).insert(
      data.stages.map((s) => ({
        template_id: id!,
        position: s.position,
        name: s.name.trim() || `Stage ${s.position}`,
        requires_review: s.requires_review,
        default_assignee_id: s.default_assignee_id,
        default_reviewer_id: s.default_reviewer_id,
        default_due_offset_days: s.default_due_offset_days,
        required_fields: s.required_fields,
        branch_options: s.branch_options,
        branch_target_map: s.branch_target_map,
        next_stage_position: s.next_stage_position,
      })) as never
    );
    return { id };
  });

export const deleteWorkflowTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("workflow_templates" as never).delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Start a workflow: create instance + first-stage task. */
export const startWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    templateId: string; projectId: string; title: string;
    description?: string | null; dueDate?: string | null;
    assigneeId?: string | null;
    priority?: "low" | "medium" | "high";
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: stagesRaw, error: stagesErr } = await supabase
      .from("workflow_template_stages" as never)
      .select("*")
      .eq("template_id", data.templateId)
      .order("position");
    if (stagesErr) throw stagesErr;
    const stages = (stagesRaw as unknown as Array<WorkflowStageInput & { id: string }>) ?? [];
    if (stages.length === 0) throw new Error("Template has no stages");
    const first = stages[0];
    const assignee = data.assigneeId ?? first.default_assignee_id ?? userId;

    const { data: inst, error: instErr } = await supabase
      .from("workflow_instances" as never)
      .insert({
        template_id: data.templateId, project_id: data.projectId,
        started_by: userId, current_stage_position: first.position,
      } as never)
      .select("id")
      .single();
    if (instErr) throw instErr;
    const instanceId = (inst as unknown as { id: string }).id;

    const { data: task, error: taskErr } = await supabase.rpc("create_task_full", {
      _project_id: data.projectId,
      _title: data.title.trim(),
      _description: data.description ?? undefined,
      _due_date: data.dueDate ?? undefined,
      _priority: data.priority ?? "medium",
      _assignee_id: assignee,
      _asset_links: [],
      _task_type_ids: [],
    });
    if (taskErr) throw taskErr;
    const taskId = (task as unknown as { id: string }).id;

    await supabase.from("tasks").update({
      workflow_template_id: data.templateId,
      workflow_instance_id: instanceId,
      stage_index: first.position,
      stage_snapshot: first as never,
    } as never).eq("id", taskId);

    await supabase.from("workflow_instances" as never).update({ root_task_id: taskId } as never).eq("id", instanceId);

    if (assignee && assignee !== userId) {
      await supabase.from("notifications").insert({
        user_id: assignee, kind: "task_assigned", task_id: taskId,
        body: `New task: "${data.title}" — ${first.name}`,
      });
    }
    return { taskId, instanceId };
  });

/** Resolve the acting user id (super admin can act as an impersonated user). */
async function resolveActingUser(
  supabase: any, userId: string, viewAsUserId?: string | null,
): Promise<string> {
  if (!viewAsUserId || viewAsUserId === userId) return userId;
  const { data: sa } = await supabase.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return sa ? viewAsUserId : userId;
}

/** Assignee closes a task. If a branching stage, they pick branch + next assignee. */
export const closeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    taskId: string;
    actualHours?: number | null;
    branchKey?: string | null;
    nextAssigneeId?: string | null;
    requiredFieldValues?: Record<string, unknown>;
    viewAsUserId?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const actingUserId = await resolveActingUser(supabase, userId, data.viewAsUserId);
    const { data: taskRow, error: tErr } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", data.taskId)
      .single();
    if (tErr) throw tErr;
    const task = taskRow as unknown as {
      id: string; title: string; assignee_id: string | null; created_by: string;
      reviewer_id: string | null;
      workflow_instance_id: string | null; stage_index: number | null;
      stage_snapshot: WorkflowStageInput | null; project_id: string;
    };
    if (task.assignee_id !== actingUserId) throw new Error("Only the assignee can close this task.");

    const stage = task.stage_snapshot;

    // Validate required fields
    if (stage) {
      const values = data.requiredFieldValues ?? {};
      for (const f of stage.required_fields ?? []) {
        if (f.required && !values[f.key]) throw new Error(`"${f.label}" is required`);
      }
    }

    // Log actual hours to task_activity as pending manager approval.
    if (data.actualHours && data.actualHours > 0) {
      const today = new Date().toISOString().slice(0, 10);
      await supabase.from("task_activity" as never).insert({
        task_id: task.id, actor_id: actingUserId, kind: "task_completed",
        hours: data.actualHours, approval_status: "pending", completion_date: today,
      } as never);
    }

    // Persist required-field values
    if (data.requiredFieldValues) {
      await supabase.from("tasks").update({ required_fields_values: data.requiredFieldValues as never } as never).eq("id", task.id);
    }

    // Stage requires a review? Move to review, do NOT spawn next stage yet.
    if (stage?.requires_review) {
      // Reviewer priority:
      //   1. Task's explicitly-set reviewer_id (never overwritten).
      //   2. Stage's configured default_reviewer_id (if any).
      //   3. Original creator of the workflow's root task / workflow starter.
      let reviewer: string | null = task.reviewer_id ?? null;
      if (!reviewer && stage.default_reviewer_id) {
        reviewer = stage.default_reviewer_id;
      }
      if (!reviewer && task.workflow_instance_id) {
        const { data: inst } = await supabase.from("workflow_instances" as never)
          .select("started_by, root_task_id").eq("id", task.workflow_instance_id).single();
        const instRow = inst as unknown as { started_by: string; root_task_id: string | null } | null;
        if (instRow?.root_task_id) {
          const { data: root } = await supabase.from("tasks").select("created_by").eq("id", instRow.root_task_id).single();
          reviewer = (root as unknown as { created_by: string } | null)?.created_by ?? instRow.started_by ?? null;
        } else {
          reviewer = instRow?.started_by ?? null;
        }
      }
      if (reviewer && reviewer !== task.reviewer_id) {
        await supabase.from("tasks").update({ reviewer_id: reviewer } as never).eq("id", task.id);
      }
      // If the assignee is also the reviewer (or no distinct reviewer resolved), auto-approve.
      if (!reviewer || reviewer === actingUserId) {
        await supabase.from("tasks").update({ status: "done", completion_percent: 100 } as never).eq("id", task.id);
        await spawnNextStage(supabase, task, stage, data.branchKey ?? null, data.nextAssigneeId ?? null, actingUserId);
        return { ok: true, status: "done" };
      }
      await supabase.from("tasks").update({ status: "review" } as never).eq("id", task.id);
      await supabase.from("notifications").insert({
        user_id: reviewer, kind: "review_requested", task_id: task.id,
        body: `"${task.title}" is ready for your review.`,
      });
      return { ok: true, status: "review" };
    }

    // Done + optional next stage
    await supabase.from("tasks").update({ status: "done", completion_percent: 100 } as never).eq("id", task.id);
    await spawnNextStage(supabase, task, stage, data.branchKey ?? null, data.nextAssigneeId ?? null, actingUserId);
    return { ok: true, status: "done" };
  });


/** Reviewer approves / requests changes / just comments. */
export const reviewTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    taskId: string;
    action: "approve" | "request_changes" | "comment";
    body?: string | null;
    branchKey?: string | null;
    nextAssigneeId?: string | null;
    rating?: number | null;
    viewAsUserId?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const actingUserId = await resolveActingUser(supabase, userId, data.viewAsUserId);
    const { data: taskRow, error: tErr } = await supabase.from("tasks").select("*").eq("id", data.taskId).single();
    if (tErr) throw tErr;
    const task = taskRow as unknown as {
      id: string; title: string; assignee_id: string | null; created_by: string;
      workflow_instance_id: string | null; stage_snapshot: WorkflowStageInput | null;
    };

    await supabase.from("task_review_comments" as never).insert({
      task_id: task.id, author_id: actingUserId,
      body: data.body ?? null, kind: data.action,
    } as never);

    if (data.action === "comment") return { ok: true };

    if (data.action === "request_changes") {
      await supabase.from("tasks").update({ status: "in_progress" } as never).eq("id", task.id);
      if (task.assignee_id && task.assignee_id !== actingUserId) {
        await supabase.from("notifications").insert({
          user_id: task.assignee_id, kind: "changes_requested", task_id: task.id,
          body: `Changes requested on "${task.title}"${data.body ? `: ${data.body}` : ""}`,
        });
      }
      return { ok: true };
    }

    // approve
    await supabase.from("tasks").update({ status: "done", completion_percent: 100 } as never).eq("id", task.id);

    // Optional rating: reviewer rating a different assignee
    const r = data.rating;
    if (r != null && Number.isFinite(r) && r >= 1 && r <= 5 && task.assignee_id && task.assignee_id !== actingUserId) {
      await supabase.from("task_ratings" as never).insert({
        task_id: task.id, ratee_id: task.assignee_id, rater_id: actingUserId,
        rating: Math.round(r),
      } as never);
    }

    await spawnNextStage(supabase, task, task.stage_snapshot, data.branchKey ?? null, data.nextAssigneeId ?? null, actingUserId);
    return { ok: true };
  });



/** Log time from a task (self, on own task). */
export const logTaskTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string; hours: number; note?: string | null; date?: string | null; viewAsUserId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const actingUserId = await resolveActingUser(supabase, userId, data.viewAsUserId);
    const { data: t, error: tErr } = await supabase.from("tasks").select("assignee_id").eq("id", data.taskId).single();
    if (tErr) throw tErr;
    if ((t as { assignee_id: string | null }).assignee_id !== actingUserId) {
      throw new Error("You can only log time on tasks assigned to you.");
    }
    const date = data.date ?? new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("task_activity" as never).insert({
      task_id: data.taskId, actor_id: actingUserId, kind: "time_logged",
      hours: data.hours, note: data.note ?? null,
      approval_status: "pending", completion_date: date,
    } as never);
    if (error) throw error;
    return { ok: true };
  });


/** ---------- helpers ---------- */
async function spawnNextStage(
  supabase: any,
  task: { id: string; title: string; workflow_instance_id: string | null; stage_snapshot: WorkflowStageInput | null; project_id?: string; asset_links?: any[] | null },
  stage: WorkflowStageInput | null,
  branchKey: string | null,
  nextAssigneeId: string | null,
  actorId: string,
) {
  if (!stage || !task.workflow_instance_id) return;
  const { data: inst } = await supabase.from("workflow_instances" as never)
    .select("template_id, started_by, project_id").eq("id", task.workflow_instance_id).single();
  const instance = inst as unknown as { template_id: string; started_by: string; project_id: string | null } | null;
  if (!instance) return;

  const { data: allStages } = await supabase.from("workflow_template_stages" as never)
    .select("*").eq("template_id", instance.template_id).order("position");
  const stages = (allStages as unknown as Array<WorkflowStageInput & { id: string }>) ?? [];

  let nextPos: number | null = null;
  if (stage.branch_options.length > 0) {
    if (!branchKey) return; // caller must pick — no auto next
    nextPos = stage.branch_target_map[branchKey] ?? null;
  } else if (stage.next_stage_position != null) {
    nextPos = stage.next_stage_position;
  } else {
    const later = stages.find((s) => s.position > stage.position);
    nextPos = later?.position ?? null;
  }
  if (nextPos == null) return;

  const nextStage = stages.find((s) => s.position === nextPos);
  if (!nextStage) return;
  const assignee = nextAssigneeId ?? nextStage.default_assignee_id ?? instance.started_by;

  const projectId = task.project_id ?? instance.project_id;
  if (!projectId) return;

  const { data: newTask, error } = await supabase.rpc("create_task_full", {
    _project_id: projectId,
    _title: task.title,
    _priority: "medium",
    _assignee_id: assignee,
    _asset_links: task.asset_links ?? [],
    _task_type_ids: [],
  });
  if (error) throw error;
  const newTaskId = (newTask as unknown as { id: string }).id;
  await supabase.from("tasks").update({
    workflow_template_id: instance.template_id,
    workflow_instance_id: task.workflow_instance_id,
    stage_index: nextStage.position,
    stage_snapshot: nextStage as never,
  } as never).eq("id", newTaskId);
  await supabase.from("workflow_instances" as never).update({ current_stage_position: nextStage.position } as never).eq("id", task.workflow_instance_id);
  if (assignee && assignee !== actorId) {
    await supabase.from("notifications").insert({
      user_id: assignee, kind: "task_assigned", task_id: newTaskId,
      body: `New task: "${task.title}" — ${nextStage.name}`,
    });
  }
}

/** List review comments for a task (client convenience). */
export const listTaskReviewComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("task_review_comments" as never)
      .select("id, body, kind, created_at, author:profiles!task_review_comments_author_id_fkey(id, full_name, email)")
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (rows as unknown as Array<{
      id: string; body: string | null; kind: string; created_at: string;
      author: { id: string; full_name: string | null; email: string | null } | null;
    }>) ?? [];
  });
