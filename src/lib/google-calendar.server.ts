import { createHmac, timingSafeEqual } from "crypto";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export function getGoogleScopes() {
  return GOOGLE_SCOPES.join(" ");
}

function stateSecret() {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return s;
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signState(userId: string) {
  const payload = `${userId}.${Date.now()}`;
  const sig = createHmac("sha256", stateSecret()).update(payload).digest();
  return `${b64url(Buffer.from(payload))}.${b64url(sig)}`;
}

export function verifyState(state: string): { userId: string } | null {
  const [payloadB64, sigB64] = state.split(".");
  if (!payloadB64 || !sigB64) return null;
  const payload = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const sig = Buffer.from(sigB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const expected = createHmac("sha256", stateSecret()).update(payload).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  const [userId, tsStr] = payload.split(".");
  const ts = Number(tsStr);
  if (!userId || !ts || Date.now() - ts > 15 * 60 * 1000) return null;
  return { userId };
}

export function buildGoogleAuthUrl(opts: { redirectUri: string; state: string; loginHint?: string }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: getGoogleScopes(),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
};

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  return await res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Google refresh failed (${res.status}): ${await res.text()}`);
  return await res.json();
}

export function decodeIdTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return (payload.email as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export type CalendarEvent = {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  all_day: boolean;
  location?: string;
  meeting_link?: string;
  attendees_count: number;
  organizer?: string;
  status?: string;
  html_link?: string;
};

export async function fetchUpcomingEvents(accessToken: string, days: number): Promise<CalendarEvent[]> {
  const now = new Date();
  const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Google Calendar list failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return (json.items ?? []).map((e: any): CalendarEvent => {
    const start = e.start?.dateTime ?? e.start?.date ?? "";
    const end = e.end?.dateTime ?? e.end?.date ?? "";
    return {
      id: e.id,
      summary: e.summary ?? "(no title)",
      description: e.description,
      start,
      end,
      all_day: !e.start?.dateTime,
      location: e.location,
      meeting_link: e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === "video")?.uri,
      attendees_count: Array.isArray(e.attendees) ? e.attendees.length : 0,
      organizer: e.organizer?.email,
      status: e.status,
      html_link: e.htmlLink,
    };
  });
}

export async function fetchEventsInRange(accessToken: string, timeMinISO: string, timeMaxISO: string): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Google Calendar list failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return (json.items ?? []).map((e: any): CalendarEvent => {
    const start = e.start?.dateTime ?? e.start?.date ?? "";
    const end = e.end?.dateTime ?? e.end?.date ?? "";
    return {
      id: e.id,
      summary: e.summary ?? "(no title)",
      description: e.description,
      start,
      end,
      all_day: !e.start?.dateTime,
      location: e.location,
      meeting_link: e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === "video")?.uri,
      attendees_count: Array.isArray(e.attendees) ? e.attendees.length : 0,
      organizer: e.organizer?.email,
      status: e.status,
      html_link: e.htmlLink,
    };
  });
}

