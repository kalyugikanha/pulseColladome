import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StandupFlag = {
  id: string;
  task_id: string | null;
  title: string | null;
  note: string | null;
  assignee_tag: string | null;
  created_at: string;
  resolved_at: string | null;
  task: {
    id: string;
    title: string;
    status: string;
    assignee: { id: string; full_name: string | null; email: string | null } | null;
  } | null;
  tagged: { id: string; full_name: string | null; email: string | null } | null;
};

const TASK_SELECT = "task:tasks(id, title, status, assignee:profiles!tasks_assignee_profile_fkey(id, full_name, email))";
const TAGGED_SELECT = "tagged:profiles!standup_flags_assignee_tag_fkey(id, full_name, email)";
const FULL_SELECT = `id, task_id, title, note, assignee_tag, created_at, resolved_at, ${TASK_SELECT}, ${TAGGED_SELECT}`;

/** Flag a task for stand-up discussion (or update the note on an existing active flag). */
export const flagTaskForStandup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string; note?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.taskId) throw new Error("taskId required");
    const note = (data.note ?? "").trim() || null;

    const { data: existing } = await supabase
      .from("standup_flags" as never)
      .select("id")
      .eq("task_id", data.taskId)
      .eq("flagged_by", userId)
      .is("resolved_at", null)
      .maybeSingle();

    const existingId = (existing as unknown as { id: string } | null)?.id ?? null;
    if (existingId) {
      const { error } = await supabase
        .from("standup_flags" as never)
        .update({ note } as never)
        .eq("id", existingId);
      if (error) throw new Error(error.message);
      return { id: existingId };
    }

    const { data: inserted, error } = await supabase
      .from("standup_flags" as never)
      .insert({ task_id: data.taskId, flagged_by: userId, note } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as unknown as { id: string }).id };
  });

/** Create a free-form agenda note (no task). Optionally tag an assignee. */
export const createStandupNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title: string; note?: string | null; assigneeTag?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const title = (data.title ?? "").trim();
    if (!title) throw new Error("Title required");
    const note = (data.note ?? "").trim() || null;
    const assignee_tag = data.assigneeTag || null;

    const { data: inserted, error } = await supabase
      .from("standup_flags" as never)
      .insert({ flagged_by: userId, title, note, assignee_tag } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as unknown as { id: string }).id };
  });

async function resolveViewedUserId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  callerId: string,
  asUserId: string | null | undefined,
): Promise<string> {
  if (!asUserId || asUserId === callerId) return callerId;
  const { data } = await supabase
    .from("super_admins")
    .select("user_id")
    .eq("user_id", callerId)
    .maybeSingle();
  return data ? asUserId : callerId;
}

/** List the current user's stand-up flags (as the flagger). */
export const listMyStandupFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { asUserId?: string | null; resolved?: boolean } | undefined) => d ?? {})
  .handler(async ({ data, context }): Promise<StandupFlag[]> => {
    const { supabase, userId } = context;
    const viewedId = await resolveViewedUserId(supabase, userId, data.asUserId);
    let q = supabase
      .from("standup_flags" as never)
      .select(FULL_SELECT)
      .eq("flagged_by", viewedId);
    q = data.resolved ? q.not("resolved_at", "is", null) : q.is("resolved_at", null);
    const { data: rows, error } = await q.order("created_at", { ascending: !data.resolved });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as StandupFlag[];
  });

/** List stand-up flags where the current user is the task assignee or tagged assignee. */
export const listStandupFlagsForMeAsAssignee = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { asUserId?: string | null; resolved?: boolean } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const viewedId = await resolveViewedUserId(supabase, userId, data.asUserId);
    let q = supabase
      .from("standup_flags" as never)
      .select(`id, task_id, title, note, assignee_tag, created_at, resolved_at, flagged_by, flagger:profiles!standup_flags_flagger_profile_fkey(id, full_name, email), task:tasks(id, title, status, assignee_id, assignee:profiles!tasks_assignee_profile_fkey(id, full_name, email))`);
    q = data.resolved ? q.not("resolved_at", "is", null) : q.is("resolved_at", null);
    const { data: rows, error } = await q.order("created_at", { ascending: !data.resolved });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as unknown as Array<{
      id: string; task_id: string | null; title: string | null; note: string | null;
      assignee_tag: string | null; created_at: string; resolved_at: string | null; flagged_by: string;
      flagger: { id: string; full_name: string | null; email: string | null } | null;
      task: { id: string; title: string; status: string; assignee_id: string | null; assignee: { id: string; full_name: string | null; email: string | null } | null } | null;
    }>;
    return list.filter((r) => r.flagged_by !== viewedId && (r.assignee_tag === viewedId || r.task?.assignee_id === viewedId));
  });

/** Get the active flag for a given task (for the current user), or null. */
export const getMyStandupFlagForTask = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("standup_flags" as never)
      .select("id, note, created_at")
      .eq("task_id", data.taskId)
      .eq("flagged_by", userId)
      .is("resolved_at", null)
      .maybeSingle();
    return (row as unknown as { id: string; note: string | null; created_at: string } | null) ?? null;
  });

/** Mark a stand-up flag as discussed (soft-resolved). */
export const resolveStandupFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("standup_flags" as never)
      .update({ resolved_at: new Date().toISOString() } as never)
      .eq("id", data.id)
      .eq("flagged_by", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Clear the current user's active flag for a task (used to toggle off). */
export const clearMyStandupFlagForTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("standup_flags" as never)
      .update({ resolved_at: new Date().toISOString() } as never)
      .eq("task_id", data.taskId)
      .eq("flagged_by", userId)
      .is("resolved_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
