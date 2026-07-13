import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_punch_status",
  title: "Get current punch status",
  description: "Check whether the signed-in user has an open punch session right now.",
  inputSchema: {} as Record<string, z.ZodTypeAny>,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("punch_sessions")
      .select("id, punch_in_time, project_code, project_name")
      .eq("user_id", ctx.getUserId()!)
      .is("punch_out_time", null)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [
        {
          type: "text",
          text: data ? `Punched in since ${data.punch_in_time}` : "No open punch session.",
        },
      ],
      structuredContent: { openSession: data ?? null },
    };
  },
});
