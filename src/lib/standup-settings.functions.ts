import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StandupSettings = {
  user_id: string;
  meeting_link: string | null;
  start_time: string; // "HH:MM:SS"
  end_time: string | null;
  updated_at: string;
};

function normalizeTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t.trim());
  if (!m) throw new Error("Invalid time format (expected HH:MM)");
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3] ?? "0");
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) {
    throw new Error("Invalid time value");
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function timeSeconds(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

/** Get the current user's stand-up settings (or null if not set). */
export const getMyStandupSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("standup_settings" as never)
      .select("user_id, meeting_link, start_time, end_time, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as StandupSettings | null) ?? null;
  });

/** List stand-up settings for a set of user ids (or all configured). */
export const listStandupSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userIds?: string[] | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("standup_settings" as never)
      .select("user_id, meeting_link, start_time, end_time, updated_at, profile:profiles!standup_settings_user_id_fkey(id, full_name, email, department)")
      .order("start_time", { ascending: true });
    if (data.userIds && data.userIds.length > 0) {
      q = q.in("user_id", data.userIds);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<StandupSettings & {
      profile: { id: string; full_name: string | null; email: string | null; department: string | null } | null;
    }>;
  });

/** Upsert current user's stand-up settings. */
export const saveMyStandupSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { meetingLink?: string | null; startTime: string; endTime?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const startTime = normalizeTime(data.startTime);
    const endTime = data.endTime ? normalizeTime(data.endTime) : null;
    if (endTime && timeSeconds(endTime) <= timeSeconds(startTime)) {
      throw new Error("End time must be after start time.");
    }
    const meetingLink = (data.meetingLink ?? "").trim() || null;

    const payload = { user_id: userId, meeting_link: meetingLink, start_time: startTime, end_time: endTime };
    const { data: row, error } = await (supabase.from("standup_settings" as never) as unknown as {
      upsert: (v: unknown, o: { onConflict: string }) => {
        select: (s: string) => { single: () => Promise<{ data: StandupSettings | null; error: { message: string } | null }> };
      };
    })
      .upsert(payload, { onConflict: "user_id" })
      .select("user_id, meeting_link, start_time, end_time, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row as StandupSettings;
  });
