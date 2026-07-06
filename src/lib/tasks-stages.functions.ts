import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StageKind = "work" | "internal_review" | "client_review";
export type StageStatus = "pending" | "active" | "in_review" | "changes_requested" | "done" | "skipped";

export type StageInput = {
  name: string;
  kind: StageKind;
  owner_id: string;
  reviewer_id?: string | null;
};

function stageError(error: { message?: string; code?: string } | Error): Error {
  const message = error.message ?? "Action failed";
  const code = "code" in error ? error.code : undefined;
  if (code === "42501" || /permission|insufficient/i.test(message)) {
    return new Error(message.includes("permission") ? message : "You don't have permission for this stage action.");
  }
  return new Error(message);
}

/** List all stages for a task with owner/reviewer profiles + events */
export const listTaskStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [stagesRes, eventsRes] = await Promise.all([
      supabase
        .from("task_stages")
        .select(`
          *,
          owner:profiles!task_stages_owner_id_fkey(id, full_name, email, avatar_url),
          reviewer:profiles!task_stages_reviewer_id_fkey(id, full_name, email, avatar_url)
        `)
        .eq("task_id", data.taskId)
        .order("position"),
      supabase
        .from("task_stage_events")
        .select("*, actor:profiles!task_stage_events_actor_id_fkey(id, full_name)")
        .eq("task_id", data.taskId)
        .order("created_at", { ascending: true }),
    ]);
    if (stagesRes.error) throw stagesRes.error;
    return { stages: stagesRes.data ?? [], events: eventsRes.data ?? [] };
  });

/** Replace the ordered stage list for a task (atomic RPC) */
export const setTaskStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string; stages: StageInput[] }) => d)
  .handler(async ({ data, context }) => {
    if (!data.stages.length) throw new Error("At least one stage is required.");
    for (const s of data.stages) {
      if (!s.name?.trim()) throw new Error("Every stage needs a name.");
      if (!s.owner_id) throw new Error(`Stage "${s.name}" needs an owner.`);
    }
    const { data: rows, error } = await context.supabase.rpc("set_task_stages", {
      _task_id: data.taskId,
      _stages: data.stages.map((s) => ({
        name: s.name.trim(),
        kind: s.kind,
        owner_id: s.owner_id,
        reviewer_id: s.reviewer_id ?? null,
      })),
    });
    if (error) throw stageError(error);
    return rows ?? [];
  });

/** Owner submits their stage as complete */
export const submitStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { stageId: string; note?: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("advance_task_stage", {
      _stage_id: data.stageId,
      _action: "submit",
      _note: data.note?.trim() || null,
      _reassign_to: null,
    });
    if (error) throw stageError(error);
    return { ok: true };
  });

/** Reviewer approves an active review stage */
export const approveStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { stageId: string; note?: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("advance_task_stage", {
      _stage_id: data.stageId,
      _action: "approve",
      _note: data.note?.trim() || null,
      _reassign_to: null,
    });
    if (error) throw stageError(error);
    return { ok: true };
  });

/** Reviewer sends the stage back with a required note */
export const rejectStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { stageId: string; note: string }) => d)
  .handler(async ({ data, context }) => {
    if (!data.note?.trim()) throw new Error("Please add a note explaining what to change.");
    const { error } = await context.supabase.rpc("advance_task_stage", {
      _stage_id: data.stageId,
      _action: "reject",
      _note: data.note.trim(),
      _reassign_to: null,
    });
    if (error) throw stageError(error);
    return { ok: true };
  });

/** Manager reassigns a stage to a different owner */
export const reassignStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { stageId: string; ownerId: string; note?: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("advance_task_stage", {
      _stage_id: data.stageId,
      _action: "reassign",
      _note: data.note?.trim() || null,
      _reassign_to: data.ownerId,
    });
    if (error) throw stageError(error);
    return { ok: true };
  });
