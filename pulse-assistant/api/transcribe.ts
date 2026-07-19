import { createServerFn } from "@tanstack/react-start";
import { authorizeToken } from "@assistant/lib/auth.server";

export const transcribeFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    return { 
      formData: (input as any).formData as FormData,
      token: (input as any).token as string 
    };
  })
  .handler(async ({ data }) => {
    const ctx = await authorizeToken(data.token);
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const form = data.formData;
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 512) {
      throw new Error("Recording too short — try again.");
    }

    const upstream = new FormData();
    upstream.append("model", "openai/gpt-4o-mini-transcribe");
    upstream.append("file", file, file.name || "recording.wav");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
    });
    if (!res.ok) {
      throw new Error(`Transcription failed: ${res.statusText}`);
    }
    const text = await res.text();
    return text;
  });
