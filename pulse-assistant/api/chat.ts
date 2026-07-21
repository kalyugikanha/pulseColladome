import { createServerFn } from "@tanstack/react-start";
import { authorizeToken } from "@assistant/lib/auth.server";
import { BDE_MASTER_PROMPT, COLLADOME_IDENTITY } from "@assistant/lib/bde-prompt";
import { fetchProjectDatabase } from "@assistant/lib/sheet-db";
import { format } from "date-fns";

type ChatMessage = { role: "user" | "assistant"; content: string };

async function loadHistory(ctx: any, limit = 20): Promise<ChatMessage[]> {
  const { data } = await ctx.supabase
    .from("assistant_messages")
    .select("role, content, created_at")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []).reverse();
  return rows.map((r: any) => ({
    role: (r.role === "assistant" ? "assistant" : "user") as ChatMessage["role"],
    content: typeof r.content === "string" ? r.content : JSON.stringify(r.content),
  }));
}

function isBDERequest(message: string): boolean {
  const lower = message.toLowerCase();
  const bdeKeywords = [
    "linkedin", "outreach", "lead", "sequence", "day 0", "follow up", "follow-up",
    "requirement", "bde", "client requirement", "looking for", "building a",
    "need a developer", "need development", "hiring", "project requirement",
    "tech stack", "we are building", "they need", "post pe", "post mein",
    "client chahta", "outreach karna", "sequence banana", "message banana",
    "iska outreach", "is requirement pe", "generate karo", "outreach do"
  ];
  return bdeKeywords.some(kw => lower.includes(kw));
}

function extractClientName(text: string): string {
  // Try to extract company/person name from LinkedIn post patterns
  const patterns = [
    /(?:at|@|for|from|company:|client:)\s+([A-Z][a-zA-Z\s&.]+?)(?:\s+is|\s+are|\s+we|\.|,)/,
    /([A-Z][a-zA-Z\s&.]{2,30})\s+(?:is hiring|is looking|are looking|is building|are building)/,
    /(?:Hi|Hello|Hey),?\s+(?:I'm|I am)\s+(?:from\s+)?([A-Z][a-zA-Z\s&.]+?)(?:\s+and|\s+we|\.|,)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "Unknown";
}

async function saveSequence(
  ctx: any,
  sequence: string,
  generatedBy: string,
  generatedByEmail: string,
  clientName: string,
  linkedinPost: string
): Promise<string | null> {
  try {
    const { data, error } = await ctx.supabase
      .from("bde_sequences")
      .insert({
        generated_by: generatedBy,
        generated_by_email: generatedByEmail,
        client_name: clientName,
        linkedin_post: linkedinPost.slice(0, 2000),
        full_sequence: sequence,
        metadata: { generated_at: new Date().toISOString() },
      })
      .select("id")
      .single();

    if (error) {
      console.error("[saveSequence] Supabase Error:", error);
      return null;
    }
    if (!data?.id) return null;
    return data.id as string;
  } catch {
    return null;
  }
}

async function callGemini(apiKey: string, messages: ChatMessage[], system: string): Promise<string> {
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${err}`);
  }

  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sorry, koi response nahi mila.";
}

export const chatFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    return {
      message: (input as any)?.message ?? "",
      token: (input as any)?.token ?? "",
      userName: (input as any)?.userName ?? "Team Member",
      userEmail: (input as any)?.userEmail ?? "",
      originUrl: (input as any)?.originUrl ?? "http://localhost:8080",
    };
  })
  .handler(async ({ data }) => {
    const ctx = await authorizeToken(data.token);
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY missing");

    const userMessage: string = String(data.message).slice(0, 8000);
    if (!userMessage) throw new Error("message required");

    const generatedBy = data.userName || "Team Member";
    const generatedByEmail = data.userEmail || "";

    // Persist user message
    await ctx.supabase.from("assistant_messages").insert({
      user_id: ctx.userId, role: "user", content: userMessage,
    });

    const history = await loadHistory(ctx, 20);
    const today = format(new Date(), "dd MMM yyyy");
    const isBDE = isBDERequest(userMessage);

    let system: string;
    if (isBDE) {
      const projectDatabase = await fetchProjectDatabase();
      system = `${COLLADOME_IDENTITY}\n\n${BDE_MASTER_PROMPT}\n\n${projectDatabase}\n\nToday is ${today}. This sequence is being generated by: ${generatedBy} (${generatedByEmail || "no email"}).`;
    } else {
      system = `${COLLADOME_IDENTITY}

Today is ${today}. The signed-in user is ${generatedBy}.
You are in internal operations mode. Help with:
- Timesheet logging
- Punch in/out
- Task creation and updates  
- Leave applications

Be helpful, concise, and friendly. Match user's language (English, Hindi, Hinglish, Marathi, etc.).`;
    }

    const messages: ChatMessage[] = [...history, { role: "user", content: userMessage }];
    let replyText = await callGemini(key, messages, system);

    let sequenceId: string | null = null;
    let shareUrl: string | null = null;

    if (isBDE) {
      // Extract client name from post
      const clientName = extractClientName(userMessage);

      // Save to Supabase for shareable link
      sequenceId = await saveSequence(ctx, replyText, generatedBy, generatedByEmail, clientName, userMessage);
      if (sequenceId) {
        // Strip trailing slash if present
        const baseUrl = data.originUrl.endsWith('/') ? data.originUrl.slice(0, -1) : data.originUrl;
        shareUrl = `${baseUrl}/outreach/${sequenceId}`;
      }

      // Append metadata footer to chat response (short version)
      const footer = `\n\n---\n📋 **Generated by:** ${generatedBy} | **Client:** ${clientName} | **Date:** ${today}${shareUrl ? `\n🔗 **Full sequence:** ${shareUrl}` : ""}`;
      replyText = replyText + footer;
    }

    // Persist assistant message
    await ctx.supabase.from("assistant_messages").insert({
      user_id: ctx.userId, role: "assistant", content: replyText,
    });

    return {
      text: replyText,
      proposals: [],
      mode: isBDE ? "bde" : "internal",
      sequenceId,
      shareUrl,
    };
  });
