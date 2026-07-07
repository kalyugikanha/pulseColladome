import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** =========== Taxonomy read ============== */
export const listTaxonomy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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

/** =========== User personal presets ============== */
export const listUserPresets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_task_presets")
      .select("*")
      .eq("user_id", context.userId)
      .order("use_count", { ascending: false })
      .limit(6);
    return data ?? [];
  });

export const bumpUserPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { domainId: string | null; departmentId: string | null; taskTypeId: string | null; label?: string | null }) => d)
  .handler(async ({ data, context }) => {
    if (!data.domainId && !data.departmentId && !data.taskTypeId) return null;
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("user_task_presets")
      .select("id, use_count")
      .eq("user_id", userId)
      .eq("domain_id", data.domainId ?? "")
      .eq("department_id", data.departmentId ?? "")
      .eq("task_type_id", data.taskTypeId ?? "")
      .maybeSingle();
    if (existing) {
      await supabase.from("user_task_presets")
        .update({ use_count: existing.use_count + 1, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      return { id: existing.id };
    }
    const { data: row } = await supabase.from("user_task_presets").insert({
      user_id: userId,
      domain_id: data.domainId,
      department_id: data.departmentId,
      task_type_id: data.taskTypeId,
      label: data.label ?? null,
    }).select("id").single();
    return row;
  });

/** =========== Role presets ============== */
export const listRolePresets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roleKey: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("role_task_type_presets")
      .select("task_type_id")
      .eq("role_key", data.roleKey);
    return (rows ?? []).map((r) => r.task_type_id);
  });

export const setRolePresets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roleKey: string; taskTypeIds: string[] }) => d)
  .handler(async ({ data, context }) => {
    await context.supabase.from("role_task_type_presets").delete().eq("role_key", data.roleKey);
    if (data.taskTypeIds.length > 0) {
      await context.supabase.from("role_task_type_presets").insert(
        data.taskTypeIds.map((id) => ({ role_key: data.roleKey, task_type_id: id }))
      );
    }
    return { ok: true };
  });

/** =========== Task create/update with extensions ============== */
type AssetLink = { label: string; url: string };
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
};

function taskCreateError(error: { message?: string; code?: string; details?: string } | Error): Error {
  const message = error.message ?? "Task could not be created";
  const code = "code" in error ? error.code : undefined;
  const details = "details" in error ? (error.details ?? "") : "";
  const blob = `${message} ${details}`;

  if (
    code === "42501" ||
    /row-level security|permission denied|insufficient privilege/i.test(message)
  ) {
    return new Error("You don't have permission to assign this task/type combination.");
  }
  if (code === "23503" || /foreign key/i.test(message)) {
    if (/tasks_assignee(_profile)?_fkey/.test(blob)) {
      return new Error("Selected assignee has no profile yet. Ask an admin to sync them, then try again.");
    }
    if (/tasks_reviewer_id_fkey/.test(blob)) {
      return new Error("Selected reviewer has no profile yet. Ask an admin to sync them, then try again.");
    }
    if (/tasks_project_id_fkey/.test(blob)) {
      return new Error("This project no longer exists. Refresh and pick another.");
    }
    if (/task_task_types_task_type_id_fkey/.test(blob)) {
      return new Error("One of the selected task types was deleted. Reselect and try again.");
    }
    if (/tasks_domain_id_fkey/.test(blob)) {
      return new Error("The selected domain was removed. Pick another.");
    }
    if (/tasks_department_id_fkey/.test(blob)) {
      return new Error("The selected department was removed. Pick another.");
    }
    return new Error("One of the selected task fields is no longer available. Please reselect project, assignee, and task type.");
  }
  if (code === "23514" || /required|check/i.test(message)) {
    return new Error(message || "Please complete the required task fields.");
  }

  return new Error("Task could not be created. Please try again or contact an admin.");
}

export const createTaskFull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: TaskInput) => d)
  .handler(async ({ data, context }) => {
    const title = data.title.trim();
    if (!title) throw new Error("Task title is required.");
    if (!data.projectId) throw new Error("Please select a project.");

    const { supabase } = context;
    const { data: task, error } = await supabase.rpc("create_task_full", {
      _project_id: data.projectId,
      _title: title,
      _description: data.description?.trim() || undefined,
      _due_date: data.dueDate || undefined,
      _priority: data.priority,
      _assignee_id: data.assigneeId,
      _asset_links: data.assetLinks,
      _domain_id: data.domainId ?? undefined,
      _department_id: data.departmentId ?? undefined,
      _task_type_ids: data.taskTypeIds,
      _estimated_hours: data.estimatedHours ?? undefined,
    });
    if (error) throw taskCreateError(error);
    return task;
  });

export const updateTaskFull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<TaskInput> & { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Partial<{
      title: string;
      description: string | null;
      due_date: string | null;
      priority: "low" | "medium" | "high";
      assignee_id: string;
      project_id: string;
      asset_links: AssetLink[];
      domain_id: string | null;
      department_id: string | null;
    }> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.dueDate !== undefined) patch.due_date = data.dueDate || null;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.assigneeId !== undefined) patch.assignee_id = data.assigneeId;
    if (data.projectId !== undefined) patch.project_id = data.projectId;
    if (data.assetLinks !== undefined) patch.asset_links = data.assetLinks;
    if (data.domainId !== undefined) patch.domain_id = data.domainId;
    if (data.departmentId !== undefined) patch.department_id = data.departmentId;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("tasks").update(patch).eq("id", data.id);
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

/** =========== Tasks Overview grid ============== */
export const listTasksOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    employeeIds?: string[];
    departments?: string[];
    projectIds?: string[];
    dateFrom?: string | null;
    dateTo?: string | null;
    statuses?: string[];
  }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("tasks")
      .select(`
        id, title, description, status, priority, due_date, created_at, asset_links,
        assignee:profiles!tasks_assignee_profile_fkey(id, full_name, email, department),
        project:projects(id, name, code),
        domain:taxonomy_domains(id, name),
        department:taxonomy_departments(id, name),
        task_types:task_task_types(task_type:taxonomy_task_types(id, name))
      `)
      .order("due_date", { ascending: true, nullsFirst: false });
    if (data.employeeIds?.length) q = q.in("assignee_id", data.employeeIds);
    if (data.projectIds?.length) q = q.in("project_id", data.projectIds);
    if (data.statuses?.length) q = q.in("status", data.statuses as ("todo"|"in_progress"|"done")[]);
    if (data.dateFrom) q = q.gte("due_date", data.dateFrom);
    if (data.dateTo) q = q.lte("due_date", data.dateTo);
    const { data: rows, error } = await q;
    if (error) throw error;
    let filtered = rows ?? [];
    if (data.departments?.length) {
      const set = new Set(data.departments);
      filtered = filtered.filter((r: { assignee?: { department: string | null } | null }) =>
        r.assignee?.department && set.has(r.assignee.department));
    }
    return filtered;
  });

/** =========== Task Templates ============== */
type TemplateInput = {
  id?: string;
  title: string;
  description?: string | null;
  projectId: string | null;
  domainId: string | null;
  departmentId: string | null;
  defaultAssigneeId: string | null;
  assetLinks: AssetLink[];
  recurrence: "none" | "weekly" | "monthly";
  dayOfMonth: number | null;
  weekday: number | null;
  priority: "low" | "medium" | "high";
  active: boolean;
  taskTypeIds: string[];
};

export const listTaskTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("task_templates")
      .select(`
        *,
        assignee:profiles!task_templates_default_assignee_profile_fkey(id, full_name, department),
        project:projects(id, name),
        domain:taxonomy_domains(id, name),
        department:taxonomy_departments(id, name),
        task_types:task_template_task_types(task_type:taxonomy_task_types(id, name))
      `)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertTaskTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: TemplateInput) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      title: data.title,
      description: data.description || null,
      project_id: data.projectId,
      domain_id: data.domainId,
      department_id: data.departmentId,
      default_assignee_id: data.defaultAssigneeId,
      asset_links: data.assetLinks,
      recurrence: data.recurrence,
      day_of_month: data.dayOfMonth,
      weekday: data.weekday,
      priority: data.priority,
      active: data.active,
    };
    let id = data.id;
    if (id) {
      const { error } = await supabase.from("task_templates").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { data: row, error } = await supabase.from("task_templates")
        .insert({ ...payload, created_by: userId }).select("id").single();
      if (error) throw error;
      id = row.id;
    }
    await supabase.from("task_template_task_types").delete().eq("template_id", id);
    if (data.taskTypeIds.length > 0) {
      await supabase.from("task_template_task_types").insert(
        data.taskTypeIds.map((tt) => ({ template_id: id, task_type_id: tt }))
      );
    }
    return { id };
  });

export const deleteTaskTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("task_templates").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const generateFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { templateId: string; dueDate: string | null; assigneeId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: tpl, error: tErr } = await supabase.from("task_templates")
      .select("*, task_types:task_template_task_types(task_type_id)")
      .eq("id", data.templateId).single();
    if (tErr) throw tErr;
    const assignee = data.assigneeId ?? tpl.default_assignee_id;
    if (!assignee) throw new Error("Template needs a default assignee");
    if (!tpl.project_id) throw new Error("Template needs a project");
    const { data: task, error } = await supabase.from("tasks").insert({
      project_id: tpl.project_id,
      title: tpl.title,
      description: tpl.description,
      due_date: data.dueDate,
      priority: tpl.priority,
      status: "todo",
      assignee_id: assignee,
      created_by: userId,
      asset_links: tpl.asset_links,
      domain_id: tpl.domain_id,
      department_id: tpl.department_id,
      template_id: tpl.id,
    }).select("id").single();
    if (error) throw error;
    const typeIds = (tpl.task_types as { task_type_id: string }[] | null)?.map((t) => t.task_type_id) ?? [];
    if (typeIds.length > 0) {
      await supabase.from("task_task_types").insert(
        typeIds.map((id) => ({ task_id: task.id, task_type_id: id }))
      );
    }
    return { id: task.id };
  });

/** =========== Admin taxonomy CRUD ============== */
export const upsertDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("taxonomy_domains").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const upsertDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("taxonomy_departments").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const upsertTaskType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("taxonomy_task_types").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
