import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PunchAllocationInput = {
  projectId: string;
  hours: number;
  comments: string;
};

type PunchInInput = {
  sessionDate: string;
};

type PunchOutInput = {
  sessionId: string;
  allocations: PunchAllocationInput[];
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
    const hours = Number(row.hours);
    const comments = typeof row.comments === "string" ? row.comments.trim() : "";

    if (!projectId) throw new Error(`Row ${index + 1}: pick a project.`);
    if (!Number.isFinite(hours) || hours <= 0) throw new Error(`Row ${index + 1}: enter hours (>0).`);
    if (!comments) throw new Error(`Row ${index + 1}: add a comment.`);

    return { projectId, hours: Number(hours.toFixed(2)), comments };
  });

  const projectIds = allocations.map((row) => row.projectId);
  if (new Set(projectIds).size !== projectIds.length) {
    throw new Error("Same project listed twice — merge them.");
  }

  return { sessionId: input.sessionId.trim(), allocations };
}

function toPunchSession(row: any) {
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
    allocations: (row.allocations as unknown[] | null) ?? null,
  };
}

async function syncAttendance(supabase: any, userId: string, sessionDate: string) {
  const { error } = await supabase.rpc("sync_attendance_from_punch_sessions", {
    _user_id: userId,
    _session_date: sessionDate,
  });
  if (error) console.warn("Attendance sync fallback failed", error.message);
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
      await syncAttendance(supabase, userId, data.sessionDate);
      return { status: "already_open" as const, session: toPunchSession(existingToday) };
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

      await syncAttendance(supabase, userId, openSession.session_date);
      return { status: "already_open" as const, session: toPunchSession(openSession) };
    }

    await syncAttendance(supabase, userId, data.sessionDate);
    return { status: "punched_in" as const, session: toPunchSession(inserted) };
  });

export const punchOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PunchOutInput) => normalizePunchOutInput(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const projectIds = data.allocations.map((row) => row.projectId);
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("id, code, name")
      .in("id", projectIds);
    if (projectsError) throw new Error(projectsError.message);

    const projectById = new Map((projects ?? []).map((project: any) => [project.id as string, project]));
    const allocations = data.allocations.map((row) => {
      const project = projectById.get(row.projectId);
      if (!project) throw new Error("One of the selected projects is no longer available.");
      return {
        project_id: row.projectId,
        project_code: project.code ?? null,
        project_name: project.name ?? null,
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

    await syncAttendance(supabase, userId, updated.session_date);
    return { status: "punched_out" as const, session: toPunchSession(updated) };
  });