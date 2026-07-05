// Shared proposal types — client-safe. Server validates on apply.
import { z } from "zod";

export const TimesheetProposalSchema = z.object({
  kind: z.literal("timesheet"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["add", "replace"]).default("add"),
  entries: z.array(z.object({
    project_code: z.string().min(1),
    hours: z.number().positive().max(24),
    comments: z.string().optional().nullable(),
  })).min(1),
});

export const PunchProposalSchema = z.object({
  kind: z.literal("punch"),
  action: z.enum(["in", "out"]),
  project_code: z.string().optional().nullable(),
  comments: z.string().optional().nullable(),
});

export const TaskProposalSchema = z.object({
  kind: z.literal("task"),
  operation: z.enum(["create", "update_status", "update"]),
  task_id: z.string().uuid().optional().nullable(),
  project_code: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  assignee_email: z.string().email().optional().nullable(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(["todo", "in_progress", "done", "blocked"]).optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).optional().nullable(),
});

export const LeaveProposalSchema = z.object({
  kind: z.literal("leave"),
  leave_type: z.enum(["casual", "sick", "earned", "unpaid"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().optional().nullable(),
});

export const ProposalSchema = z.discriminatedUnion("kind", [
  TimesheetProposalSchema, PunchProposalSchema, TaskProposalSchema, LeaveProposalSchema,
]);
export type Proposal = z.infer<typeof ProposalSchema>;
