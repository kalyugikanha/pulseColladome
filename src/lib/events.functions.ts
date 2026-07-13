import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ExtractInput = z.object({
  text: z.string().optional(),
  fileBase64: z.string().optional(),
  mimeType: z.string().optional(),
});

export type ExtractedEvent = {
  title: string | null;
  location: string | null;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
};

export const extractEventFromSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ExtractInput.parse(data))
  .handler(async ({ data }): Promise<ExtractedEvent> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const today = new Date().toISOString().slice(0, 10);
    const system = `You extract event details from forwarded messages, emails, flyers, or screenshots.
Return STRICT JSON with keys: title (string), location (string or null), start_date (YYYY-MM-DD or null), end_date (YYYY-MM-DD or null).
Today's date is ${today} — use it to resolve relative dates like "next Friday". If only one date is given, set end_date to null.
Do not invent details. If a field is missing, use null.`;

    const userBlocks: Array<Record<string, unknown>> = [];
    if (data.text && data.text.trim()) {
      userBlocks.push({ type: "text", text: data.text.trim() });
    } else {
      userBlocks.push({ type: "text", text: "Extract event details from the attached file." });
    }
    if (data.fileBase64 && data.mimeType) {
      if (data.mimeType.startsWith("image/")) {
        userBlocks.push({
          type: "image_url",
          image_url: { url: `data:${data.mimeType};base64,${data.fileBase64}` },
        });
      } else {
        userBlocks.push({
          type: "file",
          file: {
            filename: "source",
            file_data: `data:${data.mimeType};base64,${data.fileBase64}`,
          },
        });
      }
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userBlocks },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) throw new Error("AI is busy right now — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Plans & credits.");
    if (!res.ok) throw new Error(`AI extraction failed (${res.status})`);

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return {
      title: s(parsed.title),
      location: s(parsed.location),
      startDate: s(parsed.start_date),
      endDate: s(parsed.end_date),
    };
  });
