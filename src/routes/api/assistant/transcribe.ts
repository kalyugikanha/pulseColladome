import { createFileRoute } from "@tanstack/react-router";
import { authorizeRequest } from "@/lib/assistant/auth.server";

export const Route = createFileRoute("/api/assistant/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try { await authorizeRequest(request); }
        catch { return new Response("Unauthorized", { status: 401 }); }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.size < 512) {
          return new Response(JSON.stringify({ error: "Recording too short — try again." }), { status: 400, headers: { "content-type": "application/json" } });
        }

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        upstream.append("file", file, file.name || "recording.wav");

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: upstream,
        });
        const text = await res.text();
        return new Response(text, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } });
      },
    },
  },
});
