import { supabase } from "@/integrations/supabase/client";

export type MarketingCloseInput = {
  taskId: string;
  title: string;
  fromStage: string | null;
  currentAssigneeId: string | null;
  requesterId: string | null;
  actorId: string;
  hours: number;
  note?: string;
  nextAssigneeId?: string | null;
};

/**
 * Close a marketing task: mark it "posted" pending approval, insert a
 * task_activity row with hours awaiting approval, and notify the reviewer.
 * Used by both the marketing kanban ("Mark done" drop on the Posted column)
 * and the My Tasks list (status → Done on a marketing card).
 */
export async function closeMarketingTask(input: MarketingCloseInput) {
  const nextAssignee = input.nextAssigneeId ?? input.currentAssigneeId ?? input.actorId;
  const patch: Record<string, unknown> = {
    marketing_stage: "posted",
    status: "review",
    assignee_id: nextAssignee,
  };
  const { error: upErr } = await supabase.from("tasks").update(patch).eq("id", input.taskId);
  if (upErr) throw upErr;

  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  await supabase.from("task_activity" as any).insert({
    task_id: input.taskId,
    actor_id: input.actorId,
    kind: "task_completed",
    from_value: input.fromStage,
    to_value: "posted",
    note: input.note ?? null,
    hours: input.hours,
    approval_status: "pending",
    completion_date: todayStr,
  } as any);

  if (input.note && input.note.trim()) {
    await supabase.from("task_comments").insert({
      task_id: input.taskId, author_id: input.actorId, body: input.note.trim(),
    });
  }

  // Notify the person who needs to approve / act next.
  if (nextAssignee && nextAssignee !== input.actorId) {
    await supabase.from("notifications").insert({
      user_id: nextAssignee, kind: "task_hours_pending", task_id: input.taskId,
      body: `"${input.title}" is ready for you to review (${input.hours}h logged).`,
    });
  }
}
