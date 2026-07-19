import { createServerFn } from "@tanstack/react-start";
import { authorizeToken } from "@assistant/lib/auth.server";
import { ProposalSchema, type Proposal } from "./proposals";
import { differenceInCalendarDays } from "date-fns";

type ApplyInput = { proposal: unknown; viewAsUserId?: string | null; token: string };

export const applyProposal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown): ApplyInput => {
    const i = input as ApplyInput;
    return { proposal: i?.proposal, viewAsUserId: i?.viewAsUserId ?? null, token: i?.token ?? "" };
  })
  .handler(async ({ data }) => {
    const { supabase, userId } = await authorizeToken(data.token, data.viewAsUserId);
    const proposal = ProposalSchema.parse(data.proposal) as Proposal;

    // Determine acting user (view-as impersonation, super admin only)
    let actingUserId = userId;
    if (data.viewAsUserId && data.viewAsUserId !== userId) {
      const { data: sa } = await supabase.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle();
      if (sa) actingUserId = data.viewAsUserId;
    }

    if (proposal.kind === "timesheet") {
      const codes = Array.from(new Set(proposal.entries.map((e) => e.project_code)));
      const { data: projects } = await supabase.from("projects").select("code, name").in("code", codes);
      const nameByCode = new Map((projects ?? []).map((p) => [p.code, p.name]));

      const { data: existing } = await supabase
        .from("attendance_logs")
        .select("id, tasks, total_hours")
        .eq("user_id", actingUserId)
        .eq("date", proposal.date)
        .maybeSingle();

      type Row = { project_code: string; project_name: string; hours: number; comments?: string | null };
      const newRows: Row[] = proposal.entries.map((e) => ({
        project_code: e.project_code,
        project_name: nameByCode.get(e.project_code) ?? e.project_code,
        hours: e.hours,
        comments: e.comments || undefined,
      }));

      const merged: Row[] = proposal.mode === "replace"
        ? newRows
        : [...((existing?.tasks as Row[] | null) ?? []), ...newRows];
      const total = merged.reduce((s, r) => s + Number(r.hours || 0), 0);

      if (existing?.id) {
        const { error } = await supabase.from("attendance_logs")
          .update({ tasks: merged, total_hours: total, last_edited_by: userId })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("attendance_logs")
          .insert({ user_id: actingUserId, date: proposal.date, tasks: merged, total_hours: total, last_edited_by: userId });
        if (error) throw new Error(error.message);
      }
      return { ok: true, summary: `Saved ${proposal.entries.length} entr${proposal.entries.length === 1 ? "y" : "ies"} on ${proposal.date}. Day total: ${total.toFixed(1)}h.` };
    }

    if (proposal.kind === "punch") {
      const today = new Date().toISOString().slice(0, 10);
      if (proposal.action === "in") {
        // Ensure no open session
        const { data: open } = await supabase.from("punch_sessions").select("id").eq("user_id", actingUserId).is("punch_out_time", null).maybeSingle();
        if (open) throw new Error("You already have an open punch session.");
        let projectId: string | null = null;
        let projectName: string | null = null;
        if (proposal.project_code) {
          const { data: p } = await supabase.from("projects").select("id, code, name").eq("code", proposal.project_code).maybeSingle();
          if (p) { projectId = p.id; projectName = p.name; }
        }
        const { error } = await supabase.from("punch_sessions").insert({
          user_id: actingUserId, session_date: today,
          punch_in_time: new Date().toISOString(),
          project_id: projectId, project_code: proposal.project_code ?? null, project_name: projectName,
          comments: proposal.comments ?? null,
        });
        if (error) throw new Error(error.message);
        return { ok: true, summary: "Punched in." };
      } else {
        const { data: open } = await supabase.from("punch_sessions").select("id, punch_in_time").eq("user_id", actingUserId).is("punch_out_time", null).maybeSingle();
        if (!open) throw new Error("No open punch session to close.");
        const now = new Date();
        const hours = (now.getTime() - new Date(open.punch_in_time as string).getTime()) / 3600000;
        const { error } = await supabase.from("punch_sessions").update({
          punch_out_time: now.toISOString(),
          hours: Math.round(hours * 100) / 100,
          ...(proposal.comments ? { comments: proposal.comments } : {}),
        }).eq("id", open.id);
        if (error) throw new Error(error.message);
        return { ok: true, summary: `Punched out. Session: ${hours.toFixed(2)}h.` };
      }
    }

    if (proposal.kind === "task") {
      if (proposal.operation === "update_status") {
        if (!proposal.task_id || !proposal.status) throw new Error("task_id and status required");
        const { error } = await supabase.from("tasks").update({ status: proposal.status }).eq("id", proposal.task_id);
        if (error) throw new Error(error.message);
        return { ok: true, summary: `Task marked ${proposal.status}.` };
      }
      if (proposal.operation === "create") {
        if (!proposal.project_code || !proposal.title) throw new Error("project_code and title required");
        const { data: p } = await supabase.from("projects").select("id").eq("code", proposal.project_code).maybeSingle();
        if (!p) throw new Error(`Unknown project ${proposal.project_code}`);
        let assigneeId: string | null = null;
        if (proposal.assignee_email) {
          const { data: prof } = await supabase.from("profiles").select("id").eq("email", proposal.assignee_email).maybeSingle();
          assigneeId = prof?.id ?? null;
        }
        const { error } = await supabase.from("tasks").insert({
          project_id: p.id, title: proposal.title,
          assignee_id: assigneeId, due_date: proposal.due_date ?? null,
          priority: proposal.priority ?? "medium",
          status: proposal.status ?? "todo",
          created_by: userId,
        });
        if (error) throw new Error(error.message);
        return { ok: true, summary: `Task "${proposal.title}" created.` };
      }
      if (proposal.operation === "update") {
        if (!proposal.task_id) throw new Error("task_id required");
        const patch: {
          title?: string; status?: "todo" | "in_progress" | "done";
          priority?: "low" | "medium" | "high"; due_date?: string;
        } = {};
        if (proposal.title) patch.title = proposal.title;
        if (proposal.status) patch.status = proposal.status;
        if (proposal.priority) patch.priority = proposal.priority;
        if (proposal.due_date) patch.due_date = proposal.due_date;
        const { error } = await supabase.from("tasks").update(patch).eq("id", proposal.task_id);
        if (error) throw new Error(error.message);
        return { ok: true, summary: "Task updated." };
      }
    }

    if (proposal.kind === "leave") {
      const days = differenceInCalendarDays(new Date(proposal.end_date), new Date(proposal.start_date)) + 1;
      if (days <= 0) throw new Error("End date must be on or after start date.");
      const { error } = await supabase.from("leave_requests").insert({
        user_id: actingUserId, leave_type: proposal.leave_type,
        start_date: proposal.start_date, end_date: proposal.end_date,
        days, reason: proposal.reason ?? null,
      });
      if (error) throw new Error(error.message);
      return { ok: true, summary: `Leave request submitted (${days} day${days === 1 ? "" : "s"}).` };
    }

    throw new Error("Unsupported proposal");
  });
