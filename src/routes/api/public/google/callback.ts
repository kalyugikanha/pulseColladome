import { createFileRoute } from "@tanstack/react-router";

const GOOGLE_CALENDAR_CALLBACK_URL = "https://colladome-pulse.lovable.app/api/public/google/callback";

function html(body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Google Calendar</title><style>body{font-family:system-ui,sans-serif;background:#0b0b10;color:#eee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#16161d;border:1px solid #2a2a35;border-radius:14px;padding:28px 32px;max-width:420px;text-align:center}.ok{color:#4ade80}.err{color:#f87171}a{color:#8ab4f8}</style></head><body><div class="card">${body}</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function redirectToDashboard(origin: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/dashboard` },
  });
}

export const Route = createFileRoute("/api/public/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errParam = url.searchParams.get("error");
        if (errParam) return html(`<h2 class="err">Google sign-in cancelled</h2><p>${errParam}</p>`, 400);
        if (!code || !state) return html(`<h2 class="err">Missing code or state</h2>`, 400);

        const { verifyState, exchangeCodeForTokens, decodeIdTokenEmail } = await import(
          "@/lib/google-calendar.server"
        );
        const parsed = verifyState(state);
        if (!parsed) return html(`<h2 class="err">Invalid or expired state</h2>`, 400);

        try {
          const tokens = await exchangeCodeForTokens(code, GOOGLE_CALENDAR_CALLBACK_URL);
          const email = decodeIdTokenEmail(tokens.id_token);
          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("google_calendar_tokens")
            .upsert(
              {
                user_id: parsed.userId,
                google_email: email,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token ?? null,
                expires_at: expiresAt,
                scope: tokens.scope ?? null,
              },
              { onConflict: "user_id" },
            );
          if (error) throw new Error(error.message);

          return redirectToDashboard(url.origin);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          return html(`<h2 class="err">Connection failed</h2><p>${msg}</p>`, 500);
        }
      },
    },
  },
});
