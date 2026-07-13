import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_tasks",
  title: "List my tasks",
  description:
    "List the signed-in user's assigned tasks (top 50, newest first). Optionally filter by status.",
  inputSchema: {
    status: z.enum(["todo", "in_progress", "review", "done"]).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, project_id")
      .eq("assignee_id", ctx.getUserId())
      .order("updated_at", { ascending: false })
      .limit(50);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { tasks: data ?? [] },
    };
  },
});
