import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GOOGLE_CALENDAR_CALLBACK_URL = "https://colladome-pulse.lovable.app/api/public/google/callback";
const GOOGLE_CALENDAR_ORIGIN = "https://colladome-pulse.lovable.app";

function maskOAuthClientId(clientId: string | undefined) {
  if (!clientId) return null;
  const trimmed = clientId.trim();
  if (trimmed.length <= 18) return `${trimmed.slice(0, 4)}…`;
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-16)}`;
}

type TokenRow = {
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  google_email: string | null;
  scope: string | null;
};

async function getFreshAccessToken(tokenRow: TokenRow, supabaseAdmin: any) {
  let accessToken = tokenRow.access_token;
  const expiresAt = new Date(tokenRow.expires_at).getTime();
  if (Date.now() <= expiresAt - 60_000) return accessToken;

  if (!tokenRow.refresh_token) {
    throw new Error("Refresh token missing — reconnect Google Calendar.");
  }

  const { refreshAccessToken } = await import("./google-calendar.server");
  const refreshed = await refreshAccessToken(tokenRow.refresh_token);
  accessToken = refreshed.access_token;
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("google_calendar_tokens")
    .update({ access_token: accessToken, expires_at: newExpiry, sync_error: null })
    .eq("user_id", tokenRow.user_id);
  return accessToken;
}

function safeDescription(value: string | undefined) {
  if (!value) return null;
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220) || null;
}

function normalizeEmailList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v).trim().toLowerCase())
    .filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    .slice(0, 20);
}

export const getGoogleAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { signState, buildGoogleAuthUrl } = await import("./google-calendar.server");
    const state = signState(context.userId);
    const url = buildGoogleAuthUrl({ redirectUri: GOOGLE_CALENDAR_CALLBACK_URL, state });
    const parsedUrl = new URL(url);
    if (parsedUrl.searchParams.get("redirect_uri") !== GOOGLE_CALENDAR_CALLBACK_URL) {
      throw new Error("Google Calendar OAuth redirect URI sanity check failed.");
    }
    return { url };
  });

export const getGoogleCalendarOAuthDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { signState, buildGoogleAuthUrl, getGoogleScopes } = await import("./google-calendar.server");
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const hasClientSecret = Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    let redirectUri = GOOGLE_CALENDAR_CALLBACK_URL;
    let authorizationUrlOk = false;
    let authorizationUrlError: string | null = null;

    if (clientId) {
      try {
        const url = buildGoogleAuthUrl({ redirectUri: GOOGLE_CALENDAR_CALLBACK_URL, state: signState(context.userId) });
        const parsed = new URL(url);
        redirectUri = parsed.searchParams.get("redirect_uri") ?? redirectUri;
        authorizationUrlOk = parsed.searchParams.get("client_id") === clientId && redirectUri === GOOGLE_CALENDAR_CALLBACK_URL;
      } catch (e: unknown) {
        authorizationUrlError = e instanceof Error ? e.message : "Could not build Google Calendar OAuth URL.";
      }
    } else {
      authorizationUrlError = "Missing GOOGLE_OAUTH_CLIENT_ID.";
    }

    return {
      flow: "google_calendar" as const,
      usesProvidedGoogleCloudCredentials: Boolean(clientId && hasClientSecret),
      hasClientId: Boolean(clientId),
      hasClientSecret,
      clientIdPreview: maskOAuthClientId(clientId),
      clientIdLooksLikeGoogleOAuthClient: Boolean(clientId?.endsWith(".apps.googleusercontent.com")),
      redirectUri,
      expectedRedirectUri: GOOGLE_CALENDAR_CALLBACK_URL,
      expectedOrigin: GOOGLE_CALENDAR_ORIGIN,
      scopes: getGoogleScopes().split(" "),
      authorizationUrlOk,
      authorizationUrlError,
    };
  });

export const getMyGoogleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("google_calendar_tokens")
      .select("google_email, connected_at, expires_at, last_synced_at, sync_error, scope")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      connected: !!data,
      google_email: data?.google_email ?? null,
      connected_at: data?.connected_at ?? null,
      last_synced_at: data?.last_synced_at ?? null,
      sync_error: data?.sync_error ?? null,
      scope: data?.scope ?? null,
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
  const { data, error } = await ctx.supabase.from("super_admins").select("user_id").eq("user_id", ctx.userId).maybeSingle();
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

export const listMyMonthEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { startISO: string; endISO: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { refreshAccessToken, fetchEventsInRange } = await import("./google-calendar.server");

    const { data: tokenRow, error } = await supabaseAdmin
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tokenRow) return { connected: false as const, events: [] };

    let accessToken = tokenRow.access_token;
    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (Date.now() > expiresAt - 60_000) {
      if (!tokenRow.refresh_token) return { connected: false as const, events: [] };
      try {
        const refreshed = await refreshAccessToken(tokenRow.refresh_token);
        accessToken = refreshed.access_token;
        const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
        await supabaseAdmin
          .from("google_calendar_tokens")
          .update({ access_token: accessToken, expires_at: newExpiry })
          .eq("user_id", context.userId);
      } catch {
        return { connected: false as const, events: [] };
      }
    }

    try {
      const events = await fetchEventsInRange(accessToken, data.startISO, data.endISO);
      return { connected: true as const, events };
    } catch {
      return { connected: true as const, events: [] };
    }
  });

export const syncMyGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { startISO?: string; endISO?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchEventsInRange } = await import("./google-calendar.server");
    const now = new Date();
    const startISO = data.startISO ?? new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const endISO = data.endISO ?? new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString();

    const { data: tokenRow, error } = await supabaseAdmin
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tokenRow) return { connected: false as const, synced: 0, error: "Connect Google Calendar first." };

    try {
      const accessToken = await getFreshAccessToken(tokenRow, supabaseAdmin);
      const events = await fetchEventsInRange(accessToken, startISO, endISO);
      const rows = events
        .filter((event) => event.id && event.start && event.end && event.status !== "cancelled")
        .map((event) => {
          const isPrivate = event.visibility === "private";
          return {
            user_id: context.userId,
            calendar_id: "primary",
            google_event_id: event.id,
            summary: isPrivate ? "Busy" : event.summary,
            description_snippet: isPrivate ? null : safeDescription(event.description),
            start_at: new Date(event.start).toISOString(),
            end_at: new Date(event.end).toISOString(),
            all_day: event.all_day,
            location: isPrivate ? null : event.location ?? null,
            meeting_link: isPrivate ? null : event.meeting_link ?? null,
            organizer_email: event.organizer ?? null,
            attendees_count: event.attendees_count,
            status: event.status ?? null,
            html_link: isPrivate ? null : event.html_link ?? null,
            is_private: isPrivate,
            synced_at: new Date().toISOString(),
          };
        });

      if (rows.length > 0) {
        const { error: upsertError } = await supabaseAdmin
          .from("google_calendar_events")
          .upsert(rows, { onConflict: "user_id,calendar_id,google_event_id" });
        if (upsertError) throw new Error(upsertError.message);
      }

      await supabaseAdmin
        .from("google_calendar_tokens")
        .update({ last_synced_at: new Date().toISOString(), sync_error: null })
        .eq("user_id", context.userId);

      return { connected: true as const, synced: rows.length, google_email: tokenRow.google_email as string | null };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Calendar sync failed";
      await supabaseAdmin
        .from("google_calendar_tokens")
        .update({ sync_error: message })
        .eq("user_id", context.userId);
      return { connected: true as const, synced: 0, error: message };
    }
  });

export const listTeamCalendarEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { startISO: string; endISO: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: events, error: eventsError }, { data: bookings, error: bookingsError }, { data: profiles, error: profilesError }, { data: tokens, error: tokensError }] = await Promise.all([
      supabaseAdmin
        .from("google_calendar_events")
        .select("*")
        .lt("start_at", data.endISO)
        .gt("end_at", data.startISO)
        .order("start_at", { ascending: true }),
      supabaseAdmin
        .from("team_calendar_bookings")
        .select("*")
        .lt("start_at", data.endISO)
        .gt("end_at", data.startISO)
        .order("start_at", { ascending: true }),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, department, avatar_url, date_of_birth, joined_on")
        .eq("is_active", true)
        .order("full_name", { ascending: true }),
      supabaseAdmin
        .from("google_calendar_tokens")
        .select("user_id, google_email, connected_at, last_synced_at, sync_error"),
    ]);
    if (eventsError) throw new Error(eventsError.message);
    if (bookingsError) throw new Error(bookingsError.message);
    if (profilesError) throw new Error(profilesError.message);
    if (tokensError) throw new Error(tokensError.message);
    return {
      events: events ?? [],
      bookings: bookings ?? [],
      profiles: profiles ?? [],
      statuses: tokens ?? [],
    };
  });

export const createTeamCalendarBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title: string; description?: string; startISO: string; endISO: string; attendeeEmails?: string[]; location?: string }) => input)
  .handler(async ({ data, context }) => {
    const title = String(data.title ?? "").trim();
    const start = new Date(data.startISO);
    const end = new Date(data.endISO);
    if (!title) throw new Error("Add a booking title.");
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      throw new Error("Choose a valid start and end time.");
    }

    const attendeeEmails = normalizeEmailList(data.attendeeEmails);
    const calendarId = process.env.TEAM_GOOGLE_CALENDAR_ID || "primary";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tokenRow, error } = await supabaseAdmin
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tokenRow) throw new Error("Connect Google Calendar before booking team time.");
    if (!String(tokenRow.scope ?? "").includes("calendar.events")) {
      throw new Error("Reconnect Google Calendar to grant booking permission.");
    }

    const { createGoogleCalendarEvent } = await import("./google-calendar.server");
    let googleEventId: string | null = null;
    let meetingLink: string | null = null;
    let htmlLink: string | null = null;
    let bookingError: string | null = null;

    try {
      const accessToken = await getFreshAccessToken(tokenRow, supabaseAdmin);
      const googleEvent = await createGoogleCalendarEvent(accessToken, {
        calendarId,
        title,
        description: data.description,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        attendeeEmails,
        location: data.location,
      });
      googleEventId = googleEvent.id;
      meetingLink = googleEvent.meeting_link ?? null;
      htmlLink = googleEvent.html_link ?? null;
    } catch (e: unknown) {
      bookingError = e instanceof Error ? e.message : "Google booking failed";
    }

    const { data: booking, error: insertError } = await supabaseAdmin
      .from("team_calendar_bookings")
      .insert({
        created_by: context.userId,
        calendar_id: calendarId,
        google_event_id: googleEventId,
        title,
        description: data.description?.trim() || null,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        location: data.location?.trim() || null,
        meeting_link: meetingLink,
        attendee_emails: attendeeEmails,
        status: bookingError ? "failed" : "created",
        error: bookingError,
      })
      .select("*")
      .single();
    if (insertError) throw new Error(insertError.message);
    if (bookingError) return { ok: false as const, booking, error: bookingError };
    return { ok: true as const, booking, html_link: htmlLink };
  });

export const findAvailableSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    userIds: string[];
    windowStartISO: string;
    windowEndISO: string;
    durationMin: number;
    stepMin?: number;
  }) => input)
  .handler(async ({ data }) => {
    const userIds = Array.from(new Set((data.userIds ?? []).filter(Boolean)));
    const windowStart = new Date(data.windowStartISO).getTime();
    const windowEnd = new Date(data.windowEndISO).getTime();
    const durationMs = Math.max(5, data.durationMin) * 60_000;
    const stepMs = Math.max(5, data.stepMin ?? 15) * 60_000;
    if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) {
      throw new Error("Invalid time window.");
    }
    if (userIds.length === 0) return { busy: [], slots: [] as { startISO: string; endISO: string }[] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const dateFrom = new Date(windowStart).toISOString().slice(0, 10);
    const dateTo = new Date(windowEnd).toISOString().slice(0, 10);

    const [events, bookings, leaves] = await Promise.all([
      supabaseAdmin
        .from("google_calendar_events")
        .select("user_id, start_at, end_at")
        .in("user_id", userIds)
        .lt("start_at", new Date(windowEnd).toISOString())
        .gt("end_at", new Date(windowStart).toISOString()),
      supabaseAdmin
        .from("team_calendar_bookings")
        .select("created_by, attendee_emails, start_at, end_at")
        .lt("start_at", new Date(windowEnd).toISOString())
        .gt("end_at", new Date(windowStart).toISOString()),
      supabaseAdmin
        .from("leave_requests")
        .select("user_id, start_date, end_date, status")
        .in("user_id", userIds)
        .eq("status", "approved")
        .lte("start_date", dateTo)
        .gte("end_date", dateFrom),
    ]);

    const busy: [number, number][] = [];
    const clip = (s: number, e: number) => {
      const a = Math.max(s, windowStart);
      const b = Math.min(e, windowEnd);
      if (b > a) busy.push([a, b]);
    };
    (events.data ?? []).forEach((r: any) =>
      clip(new Date(r.start_at).getTime(), new Date(r.end_at).getTime()));
    // Emails of selected users to match booking attendees
    const { data: selectedProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .in("id", userIds);
    const selectedEmails = new Set((selectedProfiles ?? []).map((p: any) => (p.email ?? "").toLowerCase()).filter(Boolean));
    (bookings.data ?? []).forEach((r: any) => {
      const involvesUser = userIds.includes(r.created_by) ||
        (Array.isArray(r.attendee_emails) && r.attendee_emails.some((e: string) => selectedEmails.has(String(e).toLowerCase())));
      if (!involvesUser) return;
      clip(new Date(r.start_at).getTime(), new Date(r.end_at).getTime());
    });
    (leaves.data ?? []).forEach((r: any) => {
      const s = new Date(r.start_date + "T00:00:00").getTime();
      const e = new Date(r.end_date + "T23:59:59").getTime();
      clip(s, e);
    });

    // Merge busy intervals
    busy.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const iv of busy) {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else merged.push([iv[0], iv[1]]);
    }

    // Walk window at stepMs, emit slot if fits without overlap
    const slots: { startISO: string; endISO: string }[] = [];
    let cursor = windowStart;
    // round cursor up to next step boundary from windowStart
    for (; cursor + durationMs <= windowEnd; cursor += stepMs) {
      const slotEnd = cursor + durationMs;
      const conflict = merged.some(([s, e]) => s < slotEnd && e > cursor);
      if (!conflict) {
        slots.push({ startISO: new Date(cursor).toISOString(), endISO: new Date(slotEnd).toISOString() });
        if (slots.length >= 40) break;
      }
    }

    return {
      busy: merged.map(([s, e]) => ({ startISO: new Date(s).toISOString(), endISO: new Date(e).toISOString() })),
      slots,
    };
  });


