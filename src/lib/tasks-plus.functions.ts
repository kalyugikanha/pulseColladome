import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { impersonationMiddleware } from "./impersonation.middleware";


/** =========== Taxonomy read ============== */
export const listTaxonomy = createServerFn({ method: "GET" })
  .middleware([impersonationMiddleware])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [domains, departments, types] = await Promise.all([
      supabase.from("taxonomy_domains").select("*").eq("active", true).order("sort").order("name"),
      supabase.from("taxonomy_departments").select("*").eq("active", true).order("sort").order("name"),
      supabase.from("taxonomy_task_types").select("*").eq("active", true).order("name"),
    ]);
    return {
      domains: domains.data ?? [],
      departments: departments.data ?? [],
      taskTypes: types.data ?? [],
    };
  });

/** =========== Create custom task type ============== */
export const createCustomTaskType = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { name: string; departmentId: string | null }) => d)
  .handler(async ({ data, context }) => {
    const name = data.name.trim();
    if (!name) throw new Error("Name required");
    const { data: row, error } = await context.supabase
      .from("taxonomy_task_types")
      .insert({ name, department_id: data.departmentId, is_custom: true, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

/** =========== Task create/update ============== */
type AssetLink = { label: string; url: string };
export type RecurrenceInput = {
  freq: "none" | "daily" | "weekly" | "monthly";
  /** ISO weekdays: 1=Mon..7=Sun. Only used when freq === "weekly". */
  days?: number[];
  /** 1..31. Only used when freq === "monthly". Clamps to last day of shorter months. */
  dayOfMonth?: number;
};
type TaskInput = {
  projectId: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  priority: "low" | "medium" | "high";
  assigneeId: string;
  assetLinks: AssetLink[];
  domainId: string | null;
  departmentId: string | null;
  taskTypeIds: string[];
  estimatedHours?: number | null;
  recurrence?: RecurrenceInput | null;
};

type BulkTaskInput = Omit<TaskInput, "assigneeId"> & { assigneeIds: string[] };

function taskCreateError(error: { message?: string; code?: string; details?: string } | Error): Error {
  const message = error.message ?? "Task could not be created";
  const code = "code" in error ? error.code : undefined;
  const details = "details" in error ? (error.details ?? "") : "";
  const blob = `${message} ${details}`;
  if (code === "42501" || /row-level security|permission denied|insufficient privilege/i.test(message)) {
    return new Error("You don't have permission to create this task.");
  }
  if (code === "23503" || /foreign key/i.test(message)) {
    if (/tasks_assignee(_profile)?_fkey/.test(blob)) return new Error("Selected assignee has no profile yet.");
    if (/tasks_project_id_fkey/.test(blob)) return new Error("This project no longer exists.");
    return new Error("One of the selected fields is no longer available.");
  }
  return new Error(message || "Task could not be created.");
}

// Creates one task for a single assignee. Shared by createTaskFull and
// createTasksBulk. Same behavior as the previous inline handler:
// RPC create, impersonation re-attribution, default reviewer, recurrence.
async function createOneTaskForAssignee(
  data: TaskInput,
  context: {
    supabase: {
      rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      from: (table: string) => {
        update: (patch: Record<string, unknown>) => {
          eq: (col: string, val: unknown) => Promise<{ error: unknown }> & {
            is: (col: string, val: null) => Promise<{ error: unknown }>;
          };
        };
      };
    };
    userId: string;
    actingUserId: string;
    isImpersonating: boolean;
  },
): Promise<{ id: string } & Record<string, unknown>> {
  const title = data.title.trim();
  if (!title) throw new Error("Task title is required.");
  if (!data.projectId) throw new Error("Please select a project.");
  const { supabase } = context;
  const rec = data.recurrence;
  const isRecurring = !!rec && rec.freq !== "none";
  if (isRecurring && rec!.freq === "weekly" && (!rec!.days || rec!.days.length === 0)) {
    throw new Error("Pick at least one weekday for weekly recurrence.");
  }
  if (isRecurring && rec!.freq === "monthly") {
    const dom = rec!.dayOfMonth ?? 0;
    if (!Number.isInteger(dom) || dom < 1 || dom > 31) {
      throw new Error("Pick a day of the month (1–31) for monthly recurrence.");
    }
  }
  const { data: task, error } = await supabase.rpc("create_task_full", {
    _project_id: data.projectId,
    _title: title,
    _description: data.description?.trim() || undefined,
    _due_date: isRecurring ? undefined : (data.dueDate || undefined),
    _priority: data.priority,
    _assignee_id: data.assigneeId,
    _asset_links: data.assetLinks,
    _department_id: data.departmentId ?? undefined,
    _task_type_ids: data.taskTypeIds,
    _estimated_hours: data.estimatedHours ?? undefined,
  });
  if (error) throw taskCreateError(error as { message?: string; code?: string; details?: string });
  const taskId = (task as unknown as { id: string }).id;

  if (context.isImpersonating && context.actingUserId !== context.userId) {
    await (supabase.from("tasks").update({ created_by: context.actingUserId }) as unknown as { eq: (c: string, v: unknown) => Promise<unknown> }).eq("id", taskId);
  }

  const creatorId = context.actingUserId;
  if (creatorId && data.assigneeId && creatorId !== data.assigneeId) {
    await (supabase.from("tasks").update({ reviewer_id: creatorId }) as unknown as { eq: (c: string, v: unknown) => { is: (c: string, v: null) => Promise<unknown> } })
      .eq("id", taskId).is("reviewer_id", null);
  }

  if (isRecurring) {
    const { error: upErr } = await (supabase.from("tasks").update({
      is_recurring_template: true,
      recurrence_freq: rec!.freq,
      recurrence_days: rec!.freq === "weekly" ? (rec!.days ?? []) : null,
      recurrence_day_of_month: rec!.freq === "monthly" ? (rec!.dayOfMonth ?? null) : null,
      due_date: null,
    }) as unknown as { eq: (c: string, v: unknown) => Promise<{ error: unknown }> }).eq("id", taskId);
    if (upErr) throw upErr;
    const { error: genErr } = await supabase.rpc("generate_recurring_task_occurrences");
    if (genErr) throw genErr;
  }
  return task as { id: string } & Record<string, unknown>;
}

export const createTaskFull = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: TaskInput) => d)
  .handler(async ({ data, context }) => {
    const t = await createOneTaskForAssignee(data, context as never);
    return { id: t.id };
  });

export const createTasksBulk = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: BulkTaskInput) => d)
  .handler(async ({ data, context }) => {
    const ids = Array.from(new Set((data.assigneeIds ?? []).filter((s) => typeof s === "string" && s.length > 0)));
    if (ids.length === 0) throw new Error("Pick at least one assignee.");
    const taskIds: string[] = [];
    const failures: { assigneeId: string; message: string }[] = [];
    for (const assigneeId of ids) {
      try {
        const t = await createOneTaskForAssignee({ ...data, assigneeId }, context as never);
        if (t?.id) taskIds.push(t.id);
      } catch (e) {
        failures.push({ assigneeId, message: (e as Error).message || "Failed" });
      }
    }
    return { createdCount: taskIds.length, taskIds, failures };
  });


/** Materialize today's occurrences for every recurring template (idempotent). */
export const generateRecurringOccurrences = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("generate_recurring_task_occurrences" as never);
    if (error) throw error;
    return { ok: true };
  });


export const duplicateTask = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: src, error: readErr } = await supabase
      .from("tasks")
      .select("title, description, project_id, priority, due_date, assignee_id, asset_links, department_id, estimated_hours, scheduled_post_date, workflow_instance_id, workflow_template_id, stage_index, stage_snapshot, required_fields_values, review_state, reviewer_id, requester_id, is_recurring_template, recurrence_freq, recurrence_days, task_types:task_task_types(task_type_id)")
      .eq("id", data.id)
      .single();
    if (readErr) throw readErr;
    if (!src?.project_id) throw new Error("Source task has no project.");
    const typeIds = ((src.task_types as { task_type_id: string }[] | null) ?? []).map((t) => t.task_type_id);
    const { data: task, error } = await supabase.rpc("create_task_full", {
      _project_id: src.project_id,
      _title: `Copy of ${src.title}`,
      _description: src.description ?? undefined,
      _due_date: src.due_date ?? undefined,
      _priority: src.priority,
      _assignee_id: src.assignee_id ?? context.actingUserId,
      _asset_links: (src.asset_links ?? []) as never,
      _department_id: src.department_id ?? undefined,
      _task_type_ids: typeIds,
      _estimated_hours: src.estimated_hours ?? undefined,
    });
    if (error) throw taskCreateError(error);
    const newId = (task as unknown as { id: string } | null)?.id;
    if (newId) {
      const carry: Record<string, unknown> = {
        scheduled_post_date: src.scheduled_post_date ?? null,
        workflow_instance_id: src.workflow_instance_id ?? null,
        workflow_template_id: src.workflow_template_id ?? null,
        stage_index: src.stage_index ?? null,
        stage_snapshot: src.stage_snapshot ?? null,
        required_fields_values: src.required_fields_values ?? null,
        requester_id: src.requester_id ?? null,
        is_recurring_template: src.is_recurring_template ?? false,
        recurrence_freq: src.recurrence_freq ?? "none",
        recurrence_days: src.recurrence_days ?? null,
      };
      if (src.review_state && src.review_state !== "none") carry.review_state = src.review_state;
      if (src.reviewer_id) carry.reviewer_id = src.reviewer_id;
      if (context.isImpersonating && context.actingUserId !== context.userId) {
        carry.created_by = context.actingUserId;
      }
      await supabase.from("tasks").update(carry as never).eq("id", newId);

      if (!src.reviewer_id) {
        const dupCreator = context.actingUserId;
        const dupAssignee = src.assignee_id ?? context.actingUserId;
        if (dupCreator && dupAssignee && dupCreator !== dupAssignee) {
          await supabase.from("tasks").update({ reviewer_id: dupCreator } as never)
            .eq("id", newId).is("reviewer_id", null);
        }
      }
    }
    return task;


  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("tasks").delete().eq("id", data.id).select("id");
    if (error) throw error;
    if (!rows || rows.length === 0) {
      throw new Error("You don't have permission to delete this task.");
    }
    return { ok: true };
  });

export const requestTaskFromManager = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { title: string; projectId?: string | null; note?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("request_task_from_manager", {
      _title: data.title,
      _project_id: data.projectId ?? undefined,
      _note: data.note ?? undefined,
    });
    if (error) throw error;
    return { id };
  });

export const updateTaskFull = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: Partial<TaskInput> & { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.dueDate !== undefined) patch.due_date = data.dueDate || null;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.assigneeId !== undefined) patch.assignee_id = data.assigneeId;
    if (data.projectId !== undefined) patch.project_id = data.projectId;
    if (data.assetLinks !== undefined) patch.asset_links = data.assetLinks;
    // domain_id column dropped; ignore data.domainId if passed.
    if (data.departmentId !== undefined) patch.department_id = data.departmentId;
    if (data.estimatedHours !== undefined) patch.estimated_hours = data.estimatedHours;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("tasks").update(patch as never).eq("id", data.id);
      if (error) throw error;
    }
    if (data.taskTypeIds !== undefined) {
      await supabase.from("task_task_types").delete().eq("task_id", data.id);
      if (data.taskTypeIds.length > 0) {
        await supabase.from("task_task_types").insert(
          data.taskTypeIds.map((tt) => ({ task_id: data.id, task_type_id: tt }))
        );
      }
    }
    return { ok: true };
  });

/** =========== Admin taxonomy CRUD ============== */
export const upsertDomain = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { id?: string; name: string; active?: boolean; sort?: number }) => d)
  .handler(async ({ data, context }) => {
    const payload = { name: data.name.trim(), active: data.active ?? true, sort: data.sort ?? 0 };
    if (data.id) {
      const { error } = await context.supabase.from("taxonomy_domains").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("taxonomy_domains").insert(payload).select("id").single();
    if (error) throw error;
    return row;
  });

export const deleteDomain = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("taxonomy_domains").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const upsertDepartment = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { id?: string; domainId: string; name: string; active?: boolean; sort?: number }) => d)
  .handler(async ({ data, context }) => {
    const payload = { domain_id: data.domainId, name: data.name.trim(), active: data.active ?? true, sort: data.sort ?? 0 };
    if (data.id) {
      const { error } = await context.supabase.from("taxonomy_departments").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("taxonomy_departments").insert(payload).select("id").single();
    if (error) throw error;
    return row;
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("taxonomy_departments").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const upsertTaskType = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { id?: string; departmentId: string | null; name: string; active?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const payload = { department_id: data.departmentId, name: data.name.trim(), active: data.active ?? true };
    if (data.id) {
      const { error } = await context.supabase.from("taxonomy_task_types").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("taxonomy_task_types")
      .insert({ ...payload, is_custom: false }).select("id").single();
    if (error) throw error;
    return row;
  });

export const deleteTaskType = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("taxonomy_task_types").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Create a "Platform" tag (category='platform', no department). */
export const upsertPlatform = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { id?: string; name: string; active?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const payload = {
      department_id: null,
      name: data.name.trim(),
      active: data.active ?? true,
      category: "platform",
    } as Record<string, unknown>;
    if (data.id) {
      const { error } = await context.supabase.from("taxonomy_task_types").update(payload as never).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("taxonomy_task_types")
      .insert({ ...payload, is_custom: false } as never).select("id").single();
    if (error) throw error;
    return row;
  });

/** Replace only the PLATFORM-category tags on a task, preserving other task types. */
export const setTaskPlatforms = createServerFn({ method: "POST" })
  .middleware([impersonationMiddleware])
  .inputValidator((d: { taskId: string; platformIds: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Load current task_types with categories, keep non-platform, replace platform set.
    const { data: existing } = await supabase.from("task_task_types")
      .select("task_type_id, task_type:taxonomy_task_types(id, category)")
      .eq("task_id", data.taskId);
    const rows = ((existing ?? []) as unknown as Array<{ task_type_id: string; task_type: { category: string | null } | null }>);
    const keep = rows.filter((r) => (r.task_type?.category ?? "general") !== "platform").map((r) => r.task_type_id);
    await supabase.from("task_task_types").delete().eq("task_id", data.taskId);
    const finalIds = Array.from(new Set([...keep, ...data.platformIds]));
    if (finalIds.length > 0) {
      const { error } = await supabase.from("task_task_types").insert(
        finalIds.map((tt) => ({ task_id: data.taskId, task_type_id: tt }))
      );
      if (error) throw error;
    }
    return { ok: true };
  });

