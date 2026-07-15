import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StandupFlag = {
  id: string;
  task_id: string;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  task: {
    id: string;
    title: string;
    status: string;
    assignee: { id: string; full_name: string | null; email: string | null } | null;
  } | null;
};

/** Flag a task for stand-up discussion (or update the note on an existing active flag). */
export const flagTaskForStandup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string; note?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.taskId) throw new Error("taskId required");
    const note = (data.note ?? "").trim() || null;

    // If there's an existing unresolved flag by this user for this task, update its note.
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

/** List the current user's active (unresolved) stand-up flags. */
export const listMyStandupFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StandupFlag[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("standup_flags" as never)
      .select("id, task_id, note, created_at, resolved_at, task:tasks(id, title, status, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email))")
      .eq("flagged_by", userId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as StandupFlag[];
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
      .update({ resolved_at: new Date().toISOString() })
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
      .update({ resolved_at: new Date().toISOString() })
      .eq("task_id", data.taskId)
      .eq("flagged_by", userId)
      .is("resolved_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
