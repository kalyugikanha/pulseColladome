import { createFileRoute } from "@tanstack/react-router";
import { authorizeRequest } from "../../../../pulse-assistant/lib/auth.server";
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { format } from "date-fns";

export const Route = createFileRoute("/api/assistant/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let ctx;
        try { 
          ctx = await authorizeRequest(request); 
        } catch { 
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } }); 
        }

        const body = await request.json().catch(() => ({}));
        const userMessage: string = String(body?.message ?? "").slice(0, 4000);
        if (!userMessage) {
          return new Response(JSON.stringify({ error: "message required" }), { status: 400, headers: { "content-type": "application/json" } });
        }

        const supabase = ctx.supabase;
        const actingUserId = ctx.actingUserId;
        const userId = ctx.userId;

        const key = process.env.GEMINI_API_KEY;
        if (!key) {
          return new Response(JSON.stringify({ error: "GEMINI_API_KEY missing" }), { status: 500, headers: { "content-type": "application/json" } });
        }

        // Persist user message
        await supabase.from("assistant_messages").insert({
          user_id: userId, role: "user", content: userMessage,
        });

        // Load history
        const { data: historyData } = await supabase
          .from("assistant_messages")
          .select("role, content, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30);
          
        const historyRows = (historyData ?? []).reverse();
        const history = historyRows.map((r) => ({
          role: r.role as "user" | "assistant" | "system",
          content: typeof r.content === "string" ? r.content : JSON.stringify(r.content),
        }));

        const proposals: unknown[] = [];
        
        const google = createGoogleGenerativeAI({ apiKey: key });
        const model = google("models/gemini-1.5-flash");

        const today = format(new Date(), "yyyy-MM-dd");

        // BDE Check logic
        let isBDE = false;
        try {
          const { text } = await generateText({
            model,
            system: `You are an intent classifier for Colladome. Determine if the user's message is a Business Development (BDE) request.
A BDE request is when a user shares a client requirement, a project description, a LinkedIn post about hiring/building, or asks to generate an outreach sequence/proposal.
Reply with EXACTLY "true" if it is a BDE request, or "false" if it's a normal chat/internal ops query.`,
            prompt: userMessage,
          });
          isBDE = text.toLowerCase().includes("true");
        } catch (e) {
          const lower = userMessage.toLowerCase();
          const bdeKeywords = ["linkedin", "outreach", "lead", "sequence", "requirement", "bde", "looking for", "building a", "hiring"];
          isBDE = bdeKeywords.some(kw => lower.includes(kw));
        }
        
        let system = `You are Pulse Assistant, an internal copilot for Colladome employees.
You help them ONLY with: logging timesheet hours, punching in/out, creating & updating tasks, and applying for leave.
Today is ${today}. The signed-in user is acting as user_id=${actingUserId}.
Always reply in the same language the user wrote in (English, Hindi, Marathi, Hinglish, etc.).
Before you claim any write action is done, you MUST call the matching propose* tool — it creates a confirmation card the user must approve. Never say "done" without a propose* call.
Use read tools (listProjects, listMyRecentTasks, getMyDay, getMyPunchStatus, getLeaveBalance) to resolve project codes, dates, and IDs before proposing.
If the user is ambiguous, ask ONE short clarifying question instead of guessing.
Never fabricate project codes. Reject requests to modify other users' data, approvals, salaries, or admin settings.`;

        if (isBDE) {
          system = `You are the Colladome Outreach Brain, an expert BDE Assistant.
Your goal is to help Business Development Executives (BDEs) generate personalized, highly converting outreach sequences based on client requirements.
Always analyze the client's requirement and generate a comprehensive Outreach Sequence from Day 0 to Day 6.
If relevant, match their requirement with Colladome's capabilities.
At the very end of your response, you MUST output a special link formatted EXACTLY like this:
🔗 **Full sequence:** http://pulse.colladome.com/bde/sequence?id=generated_sequence_here`;
        }

        try {
          const result = await generateText({
            model,
            system,
            messages: [...history, { role: "user", content: userMessage }],
            stopWhen: stepCountIs(8),
            tools: {
              listProjects: tool({
                description: "Search active projects by code or name substring.",
                parameters: z.object({ query: z.string().optional() }),
                execute: async ({ query }) => {
                  let q = supabase.from("projects").select("code, name, status").eq("status", "active").limit(20);
                  if (query && query.trim()) q = q.or(`code.ilike.%${query}%,name.ilike.%${query}%`);
                  const { data } = await q;
                  return { projects: data ?? [] };
                },
              }),
              listMyRecentTasks: tool({
                description: "List the caller's assigned tasks (top 20, newest first). Returns task id, title, project, status.",
                parameters: z.object({}),
                execute: async () => {
                  const { data } = await supabase.from("tasks")
                    .select("id, title, status, priority, due_date, project_id")
                    .eq("assignee_id", actingUserId)
                    .order("updated_at", { ascending: false }).limit(20);
                  return { tasks: data ?? [] };
                },
              }),
              getMyDay: tool({
                description: "Get the caller's attendance_log row for a date (YYYY-MM-DD).",
                parameters: z.object({ date: z.string() }),
                execute: async ({ date }) => {
                  const { data } = await supabase.from("attendance_logs")
                    .select("date, tasks, total_hours, approved_at")
                    .eq("user_id", actingUserId).eq("date", date).maybeSingle();
                  return { log: data ?? null };
                },
              }),
              getMyPunchStatus: tool({
                description: "Check if the caller has an open punch session.",
                parameters: z.object({}),
                execute: async () => {
                  const { data } = await supabase.from("punch_sessions")
                    .select("id, punch_in_time, project_code, project_name")
                    .eq("user_id", actingUserId).is("punch_out_time", null).maybeSingle();
                  return { openSession: data ?? null };
                },
              }),
              getLeaveBalance: tool({
                description: "Return the caller's leave balances.",
                parameters: z.object({}),
                execute: async () => {
                  const { data } = await supabase.from("leave_balances")
                    .select("leave_type, allocated, used").eq("user_id", actingUserId);
                  return { balances: data ?? [] };
                },
              }),
              proposeTimesheet: tool({
                description: "Propose a timesheet entry. Renders a confirmation card the user must approve. Do NOT call twice for the same request.",
                parameters: z.object({
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
                parameters: z.object({
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
                parameters: z.object({
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
                parameters: z.object({
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

          // Persist assistant message
          await supabase.from("assistant_messages").insert({
            user_id: userId, role: "assistant",
            content: JSON.parse(JSON.stringify(proposals.length ? { text: replyText, proposals } : replyText)),
          });

          return new Response(JSON.stringify({ text: replyText, proposals }), {
            headers: { "content-type": "application/json" },
          });
        } catch (error: any) {
          console.error(error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
