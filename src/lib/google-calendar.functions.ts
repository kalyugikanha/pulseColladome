import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function callbackRedirectUri(originHeader: string | null | undefined) {
  const origin = originHeader ?? "";
  if (!origin) throw new Error("Missing origin header");
  return `${origin}/api/public/google/callback`;
}

export const getGoogleAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { signState, buildGoogleAuthUrl } = await import("./google-calendar.server");
    const req = getRequest();
    const origin = req.headers.get("origin") ?? new URL(req.url).origin;
    const redirectUri = callbackRedirectUri(origin);
    const state = signState(context.userId);
    const url = buildGoogleAuthUrl({ redirectUri, state });
    return { url };
  });

export const getMyGoogleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("google_calendar_tokens")
      .select("google_email, connected_at, expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      connected: !!data,
      google_email: data?.google_email ?? null,
      connected_at: data?.connected_at ?? null,
    };
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("google_calendar_tokens")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function assertSuperAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("is_super_admin", { _user_id: ctx.userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const listTeamGoogleStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles, error: pErr }, { data: tokens, error: tErr }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, email").order("full_name", { ascending: true }),
      supabaseAdmin.from("google_calendar_tokens").select("user_id, google_email, connected_at"),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (tErr) throw new Error(tErr.message);
    const tokenMap = new Map((tokens ?? []).map((t) => [t.user_id, t]));
    return (profiles ?? []).map((p) => {
      const t = tokenMap.get(p.id);
      return {
        user_id: p.id,
        full_name: p.full_name,
        email: p.email,
        connected: !!t,
        google_email: t?.google_email ?? null,
      };
    });
  });

export const listUserUpcomingEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; days?: number }) => input)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const days = Math.max(1, Math.min(30, data.days ?? 7));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { refreshAccessToken, fetchUpcomingEvents } = await import("./google-calendar.server");

    const { data: tokenRow, error } = await supabaseAdmin
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tokenRow) return { connected: false as const, events: [] };

    let accessToken = tokenRow.access_token;
    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (Date.now() > expiresAt - 60_000) {
      if (!tokenRow.refresh_token) {
        return { connected: false as const, events: [], error: "Refresh token missing — user must reconnect." };
      }
      try {
        const refreshed = await refreshAccessToken(tokenRow.refresh_token);
        accessToken = refreshed.access_token;
        const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
        await supabaseAdmin
          .from("google_calendar_tokens")
          .update({ access_token: accessToken, expires_at: newExpiry })
          .eq("user_id", data.userId);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "refresh failed";
        if (/invalid_grant/i.test(msg)) {
          await supabaseAdmin.from("google_calendar_tokens").delete().eq("user_id", data.userId);
          return { connected: false as const, events: [], error: "Google access revoked — ask user to reconnect." };
        }
        throw e;
      }
    }

    try {
      const events = await fetchUpcomingEvents(accessToken, days);
      return { connected: true as const, events, google_email: tokenRow.google_email as string | null };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "fetch failed";
      return { connected: true as const, events: [], error: msg };
    }
  });
