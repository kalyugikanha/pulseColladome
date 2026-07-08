import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PunchAllocationInput = {
  projectId: string;
  hours: number;
  comments: string;
  taskId?: string | null;
};

type PunchInInput = {
  sessionDate: string;
};

type PunchOutInput = {
  sessionId: string;
  allocations: PunchAllocationInput[];
  punchOutTime?: string | null;
};

export type PunchAllocation = {
  project_id: string;
  project_code: string | null;
  project_name: string | null;
  task_id: string | null;
  task_title: string | null;
  hours: number;
  comments: string;
};

export type PunchSessionResult = {
  id: string;
  user_id: string;
  session_date: string;
  punch_in_time: string;
  punch_out_time: string | null;
  hours: number | null;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  comments: string | null;
  allocations: PunchAllocation[] | null;
};

export type PunchInResult = {
  status: "punched_in" | "already_open";
  session: PunchSessionResult;
};

export type PunchOutResult = {
  status: "punched_out";
  session: PunchSessionResult;
};

function requireIsoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid session date.");
  }
  return value;
}

function normalizePunchOutInput(input: PunchOutInput) {
  if (!input || typeof input.sessionId !== "string" || input.sessionId.trim() === "") {
    throw new Error("Missing punch session.");
  }
  if (!Array.isArray(input.allocations) || input.allocations.length === 0) {
    throw new Error("Add at least one project.");
  }

  const allocations = input.allocations.map((row, index) => {
    const projectId = typeof row.projectId === "string" ? row.projectId.trim() : "";
    const taskId = typeof row.taskId === "string" && row.taskId.trim() !== "" ? row.taskId.trim() : null;
    const hours = Number(row.hours);
    const comments = typeof row.comments === "string" ? row.comments.trim() : "";

    if (!projectId && !taskId) throw new Error(`Row ${index + 1}: pick a task or project.`);
    if (!Number.isFinite(hours) || hours <= 0) throw new Error(`Row ${index + 1}: enter hours (>0).`);
    if (!comments) throw new Error(`Row ${index + 1}: add a comment.`);

    return { projectId, taskId, hours: Number(hours.toFixed(2)), comments };
  });

  let punchOutTime: string | null = null;
  if (input.punchOutTime != null && input.punchOutTime !== "") {
    const d = new Date(input.punchOutTime);
    if (Number.isNaN(d.getTime())) throw new Error("Invalid punch-out time.");
    if (d.getTime() > Date.now() + 60_000) throw new Error("Punch-out time can't be in the future.");
    punchOutTime = d.toISOString();
  }

  return { sessionId: input.sessionId.trim(), allocations, punchOutTime };
}

function toPunchSession(row: any): PunchSessionResult {
  const rawAllocations = Array.isArray(row.allocations) ? row.allocations : null;
  const allocations = rawAllocations?.map((allocation: any) => ({
    project_id: String(allocation?.project_id ?? ""),
    project_code: allocation?.project_code == null ? null : String(allocation.project_code),
    project_name: allocation?.project_name == null ? null : String(allocation.project_name),
    task_id: allocation?.task_id == null ? null : String(allocation.task_id),
    task_title: allocation?.task_title == null ? null : String(allocation.task_title),
    hours: Number(allocation?.hours ?? 0),
    comments: String(allocation?.comments ?? ""),
  })) ?? null;

  return {
    id: row.id as string,
    user_id: row.user_id as string,
    session_date: row.session_date as string,
    punch_in_time: row.punch_in_time as string,
    punch_out_time: (row.punch_out_time as string | null) ?? null,
    hours: (row.hours as number | null) ?? null,
    project_id: (row.project_id as string | null) ?? null,
    project_code: (row.project_code as string | null) ?? null,
    project_name: (row.project_name as string | null) ?? null,
    comments: (row.comments as string | null) ?? null,
    allocations,
  };
}

export const punchIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PunchInInput) => ({ sessionDate: requireIsoDate(input.sessionDate) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existingToday, error: existingError } = await supabase
      .from("punch_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("session_date", data.sessionDate)
      .is("punch_out_time", null)
      .order("punch_in_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    if (existingToday) {
      return { status: "already_open" as const, session: toPunchSession(existingToday) } satisfies PunchInResult;
    }

    const { data: inserted, error } = await supabase
      .from("punch_sessions")
      .insert({
        user_id: userId,
        session_date: data.sessionDate,
        punch_in_time: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      const isDuplicate = error.code === "23505" || /duplicate|unique/i.test(error.message);
      if (!isDuplicate) throw new Error(error.message);

      const { data: openSession, error: openError } = await supabase
        .from("punch_sessions")
        .select("*")
        .eq("user_id", userId)
        .is("punch_out_time", null)
        .order("punch_in_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (openError) throw new Error(openError.message);
      if (!openSession) throw new Error("You already have an open session. Please refresh and try again.");

      return { status: "already_open" as const, session: toPunchSession(openSession) } satisfies PunchInResult;
    }

    return { status: "punched_in" as const, session: toPunchSession(inserted) } satisfies PunchInResult;
  });

export const punchOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PunchOutInput) => normalizePunchOutInput(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve any task-based rows to their project.
    const taskIds = Array.from(new Set(data.allocations.map((r) => r.taskId).filter((v): v is string => !!v)));
    const taskById = new Map<string, { id: string; title: string; project_id: string | null }>();
    if (taskIds.length) {
      const { data: taskRows, error: taskError } = await supabase
        .from("tasks")
        .select("id, title, project_id")
        .in("id", taskIds);
      if (taskError) throw new Error(taskError.message);
      (taskRows ?? []).forEach((t: any) => taskById.set(t.id, { id: t.id, title: t.title, project_id: t.project_id ?? null }));
    }

    // Effective project id per row: task's project wins if a task was picked.
    const effective = data.allocations.map((row, idx) => {
      let projectId = row.projectId || "";
      let task = row.taskId ? taskById.get(row.taskId) : null;
      if (task) {
        if (!task.project_id) throw new Error(`Row ${idx + 1}: this task has no project — set one on the task first.`);
        projectId = task.project_id;
      }
      if (!projectId) throw new Error(`Row ${idx + 1}: pick a task or project.`);
      return { ...row, projectId, task };
    });

    const projectIds = Array.from(new Set(effective.map((r) => r.projectId)));
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("id, code, name")
      .in("id", projectIds);
    if (projectsError) throw new Error(projectsError.message);

    const projectById = new Map((projects ?? []).map((project: any) => [project.id as string, project]));
    const allocations = effective.map((row) => {
      const project = projectById.get(row.projectId);
      if (!project) throw new Error("One of the selected projects is no longer available.");
      return {
        project_id: row.projectId,
        project_code: project.code ?? null,
        project_name: project.name ?? null,
        task_id: row.taskId ?? null,
        task_title: row.task?.title ?? null,
        hours: row.hours,
        comments: row.comments,
      };
    });

    const totalHours = Number(allocations.reduce((sum, row) => sum + row.hours, 0).toFixed(2));
    const first = allocations[0];
    const { data: updated, error } = await supabase
      .from("punch_sessions")
      .update({
        punch_out_time: new Date().toISOString(),
        hours: totalHours,
        project_id: first.project_id,
        project_code: first.project_code,
        project_name: first.project_name,
        primary_task_id: first.task_id,
        comments: allocations.length === 1
          ? first.comments
          : allocations.map((row) => `[${row.project_code ?? ""}] ${row.hours}h — ${row.comments}`).join("\n"),
        allocations,
      })
      .eq("id", data.sessionId)
      .eq("user_id", userId)
      .is("punch_out_time", null)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!updated) throw new Error("No open punch session found. Please refresh and try again.");

    return { status: "punched_out" as const, session: toPunchSession(updated) } satisfies PunchOutResult;
  });