import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "request_leave",
  title: "Request leave",
  description:
    "File a leave request for the signed-in user. Creates a pending leave_request row; a manager must still approve it.",
  inputSchema: {
    leave_type: z.enum(["casual", "sick", "earned", "unpaid"]),
    start_date: z.string().describe("Start date in YYYY-MM-DD."),
    end_date: z.string().describe("End date in YYYY-MM-DD."),
    days: z.number().positive().max(90).describe("Number of leave days (0.5 for a half day)."),
    reason: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("leave_requests")
      .insert({
        user_id: ctx.getUserId()!,
        leave_type: input.leave_type,
        start_date: input.start_date,
        end_date: input.end_date,
        days: input.days,
        reason: input.reason ?? null,
        status: "pending",
      })
      .select("id, status, days")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Leave request submitted (id=${data.id}, ${data.days}d, pending approval).` }],
      structuredContent: { request: data },
    };
  },
});
