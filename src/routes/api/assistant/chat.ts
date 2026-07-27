import { createFileRoute } from "@tanstack/react-router";
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { authorizeRequest } from "@/lib/assistant/auth.server";
import { format } from "date-fns";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

async function loadHistory(ctx: Awaited<ReturnType<typeof authorizeRequest>>, limit = 30) {
  const { data } = await ctx.supabase
    .from("assistant_messages")
    .select("role, content, created_at")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []).reverse();
  return rows.map((r) => ({
    role: r.role as ChatMessage["role"],
    content: typeof r.content === "string" ? r.content : JSON.stringify(r.content),
  }));
}

async function isBDERequest(model: any, message: string): Promise<boolean> {
  const system = `You are an intent classifier for Colladome. Determine if the user's message is a Business Development (BDE) request.
A BDE request is when a user shares a client requirement, a project description, a LinkedIn post about hiring/building, or asks to generate an outreach sequence/proposal.
Reply with EXACTLY "true" if it is a BDE request, or "false" if it's a normal chat/internal ops query.`;

  try {
    const { text } = await generateText({
      model,
      system,
      prompt: message,
    });
    return text.toLowerCase().includes("true");
  } catch (e) {
    const lower = message.toLowerCase();
    const bdeKeywords = ["linkedin", "outreach", "lead", "sequence", "requirement", "bde", "looking for", "building a", "hiring"];
    return bdeKeywords.some(kw => lower.includes(kw));
  }
}

export const Route = createFileRoute("/api/assistant/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let ctx;
        try { ctx = await authorizeRequest(request); }
        catch { return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } }); }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), { status: 500, headers: { "content-type": "application/json" } });

        const body = await request.json().catch(() => ({}));
        const userMessage: string = String(body?.message ?? "").slice(0, 4000);
        if (!userMessage) return new Response(JSON.stringify({ error: "message required" }), { status: 400, headers: { "content-type": "application/json" } });

        // Persist user message
        await ctx.supabase.from("assistant_messages").insert({
          user_id: ctx.userId, role: "user", content: userMessage,
        });

        const history = await loadHistory(ctx, 30);
        const proposals: unknown[] = [];

        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-3-flash-preview");

        const today = format(new Date(), "yyyy-MM-dd");
        
        const isBDE = await isBDERequest(model, userMessage);
        
        let system = `You are Pulse Assistant, an internal copilot for Colladome employees.
You help them ONLY with: logging timesheet hours, punching in/out, creating & updating tasks, and applying for leave.
Today is ${today}. The signed-in user is acting as user_id=${ctx.actingUserId}.
Always reply in the same language the user wrote in (English, Hindi, Marathi, Hinglish, etc.).
Before you claim any write action is done, you MUST call the matching propose* tool — it creates a confirmation card the user must approve. Never say "done" without a propose* call.
Use read tools (listProjects, listMyRecentTasks, getMyDay, getMyPunchStatus, getLeaveBalance) to resolve project codes, dates, and IDs before proposing.
If the user is ambiguous, ask ONE short clarifying question instead of guessing.
Never fabricate project codes. Reject requests to modify other users' data, approvals, salaries, or admin settings.`;

        if (isBDE) {
          system = `You are the Colladome Outreach Brain, an expert BDE Assistant.
Your goal is to help Business Development Executives (BDEs) generate personalized, highly converting outreach sequences based on client requirements.
Always analyze the client's requirement and generate a comprehensive Outreach Sequence from Day 0 to Day 6.
At the very end of your response, you MUST output a special link formatted EXACTLY like this:
🔗 **Full sequence:** http://pulse.colladome.com/bde/sequence?id=generated_sequence_here`;
        }

        const result = await generateText({
          model,
          system,
          messages: [...history, { role: "user", content: userMessage }],
          stopWhen: stepCountIs(8),
          tools: {
            listProjects: tool({
              description: "Search active projects by code or name substring.",
              inputSchema: z.object({ query: z.string().optional() }),
              execute: async ({ query }) => {
                let q = ctx.supabase.from("projects").select("code, name, status").eq("status", "active").limit(20);
                if (query && query.trim()) q = q.or(`code.ilike.%${query}%,name.ilike.%${query}%`);
                const { data } = await q;
                return { projects: data ?? [] };
              },
            }),
            listMyRecentTasks: tool({
              description: "List the caller's assigned tasks (top 20, newest first). Returns task id, title, project, status.",
              inputSchema: z.object({}),
              execute: async () => {
                const { data } = await ctx.supabase.from("tasks")
                  .select("id, title, status, priority, due_date, project_id")
                  .eq("assignee_id", ctx.actingUserId)
                  .order("updated_at", { ascending: false }).limit(20);
                return { tasks: data ?? [] };
              },
            }),
            getMyDay: tool({
              description: "Get the caller's attendance_log row for a date (YYYY-MM-DD).",
              inputSchema: z.object({ date: z.string() }),
              execute: async ({ date }) => {
                const { data } = await ctx.supabase.from("attendance_logs")
                  .select("date, tasks, total_hours, approved_at")
                  .eq("user_id", ctx.actingUserId).eq("date", date).maybeSingle();
                return { log: data ?? null };
              },
            }),
            getMyPunchStatus: tool({
              description: "Check if the caller has an open punch session.",
              inputSchema: z.object({}),
              execute: async () => {
                const { data } = await ctx.supabase.from("punch_sessions")
                  .select("id, punch_in_time, project_code, project_name")
                  .eq("user_id", ctx.actingUserId).is("punch_out_time", null).maybeSingle();
                return { openSession: data ?? null };
              },
            }),
            getLeaveBalance: tool({
              description: "Return the caller's leave balances.",
              inputSchema: z.object({}),
              execute: async () => {
                const { data } = await ctx.supabase.from("leave_balances")
                  .select("leave_type, allocated, used").eq("user_id", ctx.actingUserId);
                return { balances: data ?? [] };
              },
            }),
            proposeTimesheet: tool({
              description: "Propose a timesheet entry. Renders a confirmation card the user must approve. Do NOT call twice for the same request.",
              inputSchema: z.object({
                date: z.string().describe("YYYY-MM-DD"),
                mode: z.enum(["add", "replace"]).default("add"),
                entries: z.array(z.object({
                  project_code: z.string(),
                  hours: z.number().positive().max(24),
                  comments: z.string().optional(),
                })).min(1),
              }),
              execute: async (input) => {
                const p = { kind: "timesheet" as const, ...input };
                proposals.push(p);
                return { proposed: true, proposal: p };
              },
            }),
            proposePunch: tool({
              description: "Propose a punch in or out. Renders a confirmation card.",
              inputSchema: z.object({
                action: z.enum(["in", "out"]),
                project_code: z.string().optional(),
                comments: z.string().optional(),
              }),
              execute: async (input) => {
                const p = { kind: "punch" as const, ...input };
                proposals.push(p);
                return { proposed: true, proposal: p };
              },
            }),
            proposeTask: tool({
              description: "Propose creating a new task, updating a task's fields, or changing its status. Renders a confirmation card.",
              inputSchema: z.object({
                operation: z.enum(["create", "update_status", "update"]),
                task_id: z.string().optional(),
                project_code: z.string().optional(),
                title: z.string().optional(),
                assignee_email: z.string().optional(),
                due_date: z.string().optional(),
                status: z.enum(["todo", "in_progress", "done"]).optional(),
                priority: z.enum(["low", "medium", "high"]).optional(),
              }),
              execute: async (input) => {
                const p = { kind: "task" as const, ...input };
                proposals.push(p);
                return { proposed: true, proposal: p };
              },
            }),
            proposeLeave: tool({
              description: "Propose a leave request. Renders a confirmation card.",
              inputSchema: z.object({
                leave_type: z.enum(["casual", "sick", "earned", "unpaid"]),
                start_date: z.string(),
                end_date: z.string(),
                reason: z.string().optional(),
              }),
              execute: async (input) => {
                const p = { kind: "leave" as const, ...input };
                proposals.push(p);
                return { proposed: true, proposal: p };
              },
            }),
          },
        });

        const replyText = result.text || (proposals.length ? "Please review and confirm below." : "");

        // Persist assistant message (with proposals attached as JSON if any)
        await ctx.supabase.from("assistant_messages").insert({
          user_id: ctx.userId, role: "assistant",
          content: JSON.parse(JSON.stringify(proposals.length ? { text: replyText, proposals } : replyText)),
        });

        return new Response(JSON.stringify({ text: replyText, proposals }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
