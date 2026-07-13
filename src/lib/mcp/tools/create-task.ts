import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_task",
  title: "Create task",
  description:
    "Create a new task in a given project. By default the task is assigned to the signed-in user. Look up projects with list_projects first to get the project id.",
  inputSchema: {
    project_id: z.string().uuid().describe("Project UUID from list_projects."),
    title: z.string().min(1),
    description: z.string().optional(),
    due_date: z.string().optional().describe("YYYY-MM-DD"),
    priority: z.enum(["low", "medium", "high"]).optional(),
    assignee_id: z.string().uuid().optional().describe("UUID of assignee; defaults to the caller."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("create_task_full", {
      _project_id: input.project_id,
      _title: input.title,
      _description: input.description,
      _due_date: input.due_date,
      _priority: input.priority ?? "medium",
      _assignee_id: input.assignee_id ?? ctx.getUserId()!,
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Task created: ${input.title}` }],
      structuredContent: { task: data },
    };
  },
});
