import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.44.4"
import { generateText, tool, stepCountIs } from "npm:ai@7.0.15"
import { z } from "npm:zod@3.23.8"
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@3.0.5"
import { format } from "npm:date-fns@3.6.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-view-as-user",
};

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

async function loadHistory(supabase: SupabaseClient, userId: string, limit = 30) {
  const { data } = await supabase
    .from("assistant_messages")
    .select("role, content, created_at")
    .eq("user_id", userId)
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized");
    const token = authHeader.slice(7);
    
    // Connect to Production Database by default if keys are provided
    const supabaseUrl = Deno.env.get("PROD_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("PROD_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    
    // Setup Supabase Client
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) throw new Error("Unauthorized");
    
    const userId = authData.user.id;

    // View-as for Super Admins
    const { data: sa } = await supabase.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle();
    const isSuperAdmin = !!sa;
    
    const viewAs = req.headers.get("x-view-as-user")?.trim() || null;
    const actingUserId = isSuperAdmin && viewAs ? viewAs : userId;

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const userMessage: string = String(body?.message ?? "").slice(0, 4000);
    if (!userMessage) return new Response(JSON.stringify({ error: "message required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });

    // Persist user message
    await supabase.from("assistant_messages").insert({
      user_id: userId, role: "user", content: userMessage,
    });

    const history = await loadHistory(supabase, userId, 30);
    const proposals: unknown[] = [];

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const today = format(new Date(), "yyyy-MM-dd");
    
    const isBDE = await isBDERequest(model, userMessage);
    
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
            let q = supabase.from("projects").select("code, name, status").eq("status", "active").limit(20);
            if (query && query.trim()) q = q.or(`code.ilike.%${query}%,name.ilike.%${query}%`);
            const { data } = await q;
            return { projects: data ?? [] };
          },
        }),
        listMyRecentTasks: tool({
          description: "List the caller's assigned tasks (top 20, newest first). Returns task id, title, project, status.",
          inputSchema: z.object({}),
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
          inputSchema: z.object({ date: z.string() }),
          execute: async ({ date }) => {
            const { data } = await supabase.from("attendance_logs")
              .select("date, tasks, total_hours, approved_at")
              .eq("user_id", actingUserId).eq("date", date).maybeSingle();
            return { log: data ?? null };
          },
        }),
        getMyPunchStatus: tool({
          description: "Check if the caller has an open punch session.",
          inputSchema: z.object({}),
          execute: async () => {
            const { data } = await supabase.from("punch_sessions")
              .select("id, punch_in_time, project_code, project_name")
              .eq("user_id", actingUserId).is("punch_out_time", null).maybeSingle();
            return { openSession: data ?? null };
          },
        }),
        getLeaveBalance: tool({
          description: "Return the caller's leave balances.",
          inputSchema: z.object({}),
          execute: async () => {
            const { data } = await supabase.from("leave_balances")
              .select("leave_type, allocated, used").eq("user_id", actingUserId);
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

    // Persist assistant message
    await supabase.from("assistant_messages").insert({
      user_id: userId, role: "assistant",
      content: JSON.parse(JSON.stringify(proposals.length ? { text: replyText, proposals } : replyText)),
    });

    return new Response(JSON.stringify({ text: replyText, proposals }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
