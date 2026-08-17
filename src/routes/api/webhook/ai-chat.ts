import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const EXPECTED_API_KEY = "colladome-secret-key-2026";

// Helper for CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

export const Route = createFileRoute("/api/webhook/ai-chat")({
  server: {
    handlers: {
      OPTIONS: async () => {
        return new Response(null, { status: 204, headers: corsHeaders });
      },
      POST: async ({ request }) => {
        try {
          // 1. Verify API Key
          const apiKey = request.headers.get("x-api-key");
          if (apiKey !== EXPECTED_API_KEY) {
            return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing x-api-key" }), {
              status: 401,
              headers: { "content-type": "application/json", ...corsHeaders },
            });
          }

          // 2. Parse request body
          const body = await request.json().catch(() => ({}));
          const userMessage: string = String(body?.message ?? "").slice(0, 4000);
          if (!userMessage) {
            return new Response(JSON.stringify({ error: "message is required" }), {
              status: 400,
              headers: { "content-type": "application/json", ...corsHeaders },
            });
          }

          const rawHistory = Array.isArray(body?.history) ? body.history : [];
          const history = rawHistory.map((msg: any) => ({
            role: msg.role === "assistant" ? "assistant" : "user",
            content: String(msg.content ?? ""),
          }));

          // 3. Setup AI SDK
          const key = process.env.GEMINI_API_KEY;
          if (!key) {
            return new Response(JSON.stringify({ error: "GEMINI_API_KEY missing on server" }), {
              status: 500,
              headers: { "content-type": "application/json", ...corsHeaders },
            });
          }

          const google = createGoogleGenerativeAI({ apiKey: key });
          const model = google("models/gemini-1.5-flash");

          // 4. BDE Intent Check Logic
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
Always reply in the same language the user wrote in (English, Hindi, Marathi, Hinglish, etc.).
You are a helpful assistant.`;

          if (isBDE) {
            system = `You are the Colladome Outreach Brain, an expert BDE Assistant.
Your goal is to help Business Development Executives (BDEs) generate personalized, highly converting outreach sequences based on client requirements.
Always analyze the client's requirement and generate a comprehensive Outreach Sequence from Day 0 to Day 6.
If relevant, match their requirement with Colladome's capabilities.
At the very end of your response, you MUST output a special link formatted EXACTLY like this:
🔗 **Full sequence:** http://pulse.colladome.com/bde/sequence?id=generated_sequence_here`;
          }

          // 5. Generate Response
          const result = await generateText({
            model,
            system,
            messages: [...history, { role: "user", content: userMessage }],
          });

          // 6. Return response to Lovable
          return new Response(JSON.stringify({ text: result.text }), {
            status: 200,
            headers: { "content-type": "application/json", ...corsHeaders },
          });

        } catch (error: any) {
          console.error("[Webhook Error]:", error);
          return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
            status: 500,
            headers: { "content-type": "application/json", ...corsHeaders },
          });
        }
      },
    },
  },
});
