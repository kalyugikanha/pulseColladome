import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { impersonationMiddleware } from "@/lib/impersonation.middleware";

type PunchAllocationInput = {
  projectId: string;
  hours: number;
  comments: string;
  taskId?: string | null;
  atRisk?: boolean;
};

type PunchInInput = {
  sessionDate: string;
};

type PunchOutInput = {
  sessionId: string;
  allocations: PunchAllocationInput[];
  punchOutTime?: string | null;
  skip?: boolean;
};

export type PunchAllocation = {
  project_id: string;
  project_code: string | null;
  project_name: string | null;
  task_id: string | null;
  task_title: string | null;
  hours: number;
  comments: string;
  at_risk?: boolean;
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
  unloggedBalance: number;
  unloggedSince: string | null;
};

export type PunchOutResult = {
  status: "punched_out";
  session: PunchSessionResult;
  unloggedBalance: number;
  unloggedSince: string | null;
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
  const skip = !!input.skip;
  const rawAllocs = Array.isArray(input.allocations) ? input.allocations : [];
  if (!skip && rawAllocs.length === 0) {
    // Empty allocations without skip flag → treat as skip too, non-blocking.
  }

  const allocations = rawAllocs.map((row, index) => {
    const projectId = typeof row.projectId === "string" ? row.projectId.trim() : "";
    const taskId = typeof row.taskId === "string" && row.taskId.trim() !== "" ? row.taskId.trim() : null;
    const hours = Number(row.hours);
    const comments = typeof row.comments === "string" ? row.comments.trim() : "";
    const atRisk = !!row.atRisk;

    if (!projectId && !taskId) throw new Error(`Row ${index + 1}: pick a task or project.`);
    if (!Number.isFinite(hours) || hours < 0) throw new Error(`Row ${index + 1}: hours can't be negative.`);

    return { projectId, taskId, hours: Number(hours.toFixed(2)), comments, atRisk };
  });

  let punchOutTime: string | null = null;
  if (input.punchOutTime != null && input.punchOutTime !== "") {
    const d = new Date(input.punchOutTime);
    if (Number.isNaN(d.getTime())) throw new Error("Invalid punch-out time.");
    if (d.getTime() > Date.now() + 60_000) throw new Error("Punch-out time can't be in the future.");
    punchOutTime = d.toISOString();
  }

  return { sessionId: input.sessionId.trim(), allocations, punchOutTime, skip };
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
    at_risk: !!allocation?.at_risk,
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

async function readUnlogged(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("unlogged_hours_balance, unlogged_hours_since")
    .eq("id", userId)
    .maybeSingle();
  return {
    balance: Number((data as any)?.unlogged_hours_balance ?? 0),
    since: (data as any)?.unlogged_hours_since ?? null,
  };
}

/**
 * Resolve the DB client + attribution identity for punch writes.
 *
 * When an admin is impersonating another user via "View As", the punch
 * session must be attributed to the impersonated user (session.user_id =
 * actingUserId) and stamped with on_behalf_of = the real admin id, so the
 * audit trail shows the admin logged it on the employee's behalf.
 *
 * RLS on punch_sessions only allows a user to write their own rows, so on
 * the impersonation path we swap in the service-role client to bypass RLS
 * — the middleware already verified the caller is a super admin.
 */
async function resolvePunchIdentity(context: {
  supabase: unknown;
  userId: string;
  actingUserId?: string;
  impersonatedBy?: string | null;
  isImpersonating?: boolean;
}) {
  const isImpersonating = !!context.isImpersonating && !!context.actingUserId && context.actingUserId !== context.userId;
  const targetUserId = isImpersonating ? (context.actingUserId as string) : context.userId;
  const onBehalfOf = isImpersonating ? (context.impersonatedBy ?? context.userId) : null;
  if (isImpersonating) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return { db: supabaseAdmin as unknown as typeof context.supabase, targetUserId, onBehalfOf, isImpersonating };
  }
  return { db: context.supabase, targetUserId, onBehalfOf, isImpersonating };
}

export const punchIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, impersonationMiddleware])
  .inputValidator((input: PunchInInput) => ({ sessionDate: requireIsoDate(input.sessionDate) }))
  .handler(async ({ data, context }) => {
    const { db, targetUserId, onBehalfOf } = await resolvePunchIdentity(context);
    const supabase = db as any;

    // Date-agnostic: any still-open session (today or a prior day) counts as "already open".
    // A session accrues real elapsed hours until the user explicitly punches out.
    const { data: existingToday, error: existingError } = await supabase
      .from("punch_sessions")
      .select("*")
      .eq("user_id", targetUserId)
      .is("punch_out_time", null)
      .order("punch_in_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const unlogged = await readUnlogged(supabase, targetUserId);

    if (existingToday) {
      return { status: "already_open" as const, session: toPunchSession(existingToday), unloggedBalance: unlogged.balance, unloggedSince: unlogged.since } satisfies PunchInResult;
    }

    const { data: inserted, error } = await supabase
      .from("punch_sessions")
      .insert({
        user_id: targetUserId,
        session_date: data.sessionDate,
        punch_in_time: new Date().toISOString(),
        on_behalf_of: onBehalfOf,
      })
      .select("*")
      .single();

    if (error) {
      const isDuplicate = error.code === "23505" || /duplicate|unique/i.test(error.message);
      if (!isDuplicate) throw new Error(error.message);

      const { data: openSession, error: openError } = await supabase
        .from("punch_sessions")
        .select("*")
        .eq("user_id", targetUserId)
        .is("punch_out_time", null)
        .order("punch_in_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (openError) throw new Error(openError.message);
      if (!openSession) throw new Error("You already have an open session. Please refresh and try again.");

      return { status: "already_open" as const, session: toPunchSession(openSession), unloggedBalance: unlogged.balance, unloggedSince: unlogged.since } satisfies PunchInResult;
    }

    return { status: "punched_in" as const, session: toPunchSession(inserted), unloggedBalance: unlogged.balance, unloggedSince: unlogged.since } satisfies PunchInResult;
  });

export const punchOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, impersonationMiddleware])
  .inputValidator((input: PunchOutInput) => normalizePunchOutInput(input))
  .handler(async ({ data, context }) => {
    const { db, targetUserId, onBehalfOf, isImpersonating } = await resolvePunchIdentity(context);
    const supabase = db as any;

    // Fetch open session up front so we can compute duration for both allocation and skip modes.
    const { data: openRow, error: openErr } = await supabase
      .from("punch_sessions")
      .select("punch_in_time, user_id, on_behalf_of")
      .eq("id", data.sessionId)
      .eq("user_id", targetUserId)
      .is("punch_out_time", null)
      .maybeSingle();
    if (openErr) throw new Error(openErr.message);
    if (!openRow) throw new Error("No open punch session found. Please refresh and try again.");

    let punchOutIso = data.punchOutTime ?? new Date().toISOString();
    if (data.punchOutTime) {
      if (new Date(data.punchOutTime).getTime() <= new Date(openRow.punch_in_time as string).getTime()) {
        throw new Error("Punch-out time must be after punch-in time.");
      }
      punchOutIso = data.punchOutTime;
    }

    const sessionDurationHours = Number(
      (Math.max(0, (new Date(punchOutIso).getTime() - new Date(openRow.punch_in_time as string).getTime()) / 3_600_000)).toFixed(2)
    );

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
      const task = row.taskId ? taskById.get(row.taskId) : null;
      if (task) {
        if (!task.project_id) throw new Error(`Row ${idx + 1}: this task has no project — set one on the task first.`);
        projectId = task.project_id;
      }
      if (!projectId) throw new Error(`Row ${idx + 1}: pick a task or project.`);
      return { ...row, projectId, task };
    });

    const projectIds = Array.from(new Set(effective.map((r) => r.projectId)));
    let projectById = new Map<string, any>();
    if (projectIds.length) {
      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("id, code, name")
        .in("id", projectIds);
      if (projectsError) throw new Error(projectsError.message);
      projectById = new Map((projects ?? []).map((project: any) => [project.id as string, project]));
    }

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
        at_risk: !!row.atRisk,
      };
    });

    const loggedHours = Number(allocations.reduce((sum, row) => sum + row.hours, 0).toFixed(2));
    const shortfall = Number(Math.max(0, sessionDurationHours - loggedHours).toFixed(2));
    const first = allocations[0];

    // Preserve existing on_behalf_of if the session was opened during impersonation
    // but is being closed by the same impersonated identity, or update if we are
    // now impersonating.
    const preservedOnBehalfOf = isImpersonating ? onBehalfOf : (openRow.on_behalf_of ?? null);

    const { data: updated, error } = await supabase
      .from("punch_sessions")
      .update({
        punch_out_time: punchOutIso,
        // Session hours always reflect elapsed time; per-task allocations are independent.
        hours: sessionDurationHours,
        project_id: first?.project_id ?? null,
        project_code: first?.project_code ?? null,
        project_name: first?.project_name ?? null,
        primary_task_id: first?.task_id ?? null,
        comments: allocations.length === 0
          ? null
          : allocations.length === 1
            ? first.comments
            : allocations.map((row) => `[${row.project_code ?? ""}] ${row.hours}h — ${row.comments}`).join("\n"),
        allocations,
        on_behalf_of: preservedOnBehalfOf,
      })
      .eq("id", data.sessionId)
      .eq("user_id", targetUserId)
      .is("punch_out_time", null)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!updated) throw new Error("No open punch session found. Please refresh and try again.");

    // Propagate at-risk to the tasks so the assignee's reporting manager can see it.
    const atRiskTaskIds = allocations.filter((a) => a.at_risk && a.task_id).map((a) => a.task_id as string);
    if (atRiskTaskIds.length) {
      await supabase.from("tasks").update({ at_risk: true } as never).in("id", atRiskTaskIds);
    }

    // Update the target user's rolling unlogged-hours balance (the person the hours belong to).
    const prior = await readUnlogged(supabase, targetUserId);
    const newBalance = Number((prior.balance + shortfall).toFixed(2));
    const newSince = prior.since ?? (shortfall > 0 ? (updated as any).session_date : null);
    if (shortfall > 0) {
      await supabase.from("profiles").update({
        unlogged_hours_balance: newBalance,
        unlogged_hours_since: newSince,
      } as never).eq("id", targetUserId);
    }

    return {
      status: "punched_out" as const,
      session: toPunchSession(updated),
      unloggedBalance: shortfall > 0 ? newBalance : prior.balance,
      unloggedSince: shortfall > 0 ? newSince : prior.since,
    } satisfies PunchOutResult;
  });

/** Clear the user's unlogged-hours reminder. */
export const clearUnloggedHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("profiles").update({
      unlogged_hours_balance: 0,
      unlogged_hours_since: null,
    } as never).eq("id", userId);
    return { ok: true };
  });