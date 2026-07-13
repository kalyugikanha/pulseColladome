import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_attendance",
  title: "Get my attendance for a date",
  description:
    "Return the signed-in user's attendance_log row for a given date (YYYY-MM-DD) — punch in/out, total hours, tasks logged.",
  inputSchema: {
    date: z.string().describe("Date in YYYY-MM-DD format."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ date }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("attendance_logs")
      .select("date, punch_in_time, punch_out_time, total_hours, tasks, approved_at")
      .eq("user_id", ctx.getUserId())
      .eq("date", date)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? null) }],
      structuredContent: { log: data ?? null },
    };
  },
});
