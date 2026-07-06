import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function mondayOf(d: Date): string {
  const day = d.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // days since Monday
  const m = new Date(d);
  m.setDate(d.getDate() - diff);
  return m.toISOString().slice(0, 10);
}

export const currentWeekStart = createServerFn({ method: "GET" }).handler(async () => {
  return { weekStart: mondayOf(new Date()) };
});

export const upsertWeeklyScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeId: string; weekStart?: string; score: number; feedback?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const wk = data.weekStart ?? mondayOf(new Date());
    const { supabase, userId } = context;
    const { error } = await supabase.from("weekly_scores").upsert({
      employee_id: data.employeeId,
      week_start: wk,
      score: data.score,
      feedback: data.feedback ?? null,
      manager_id: userId,
    }, { onConflict: "employee_id,week_start" });
    if (error) throw error;
    return { ok: true, weekStart: wk };
  });

export const listMyScores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("weekly_scores")
      .select("*, manager:profiles!weekly_scores_manager_id_fkey(id, full_name)")
      .eq("employee_id", context.userId)
      .order("week_start", { ascending: false })
      .limit(52);
    return data ?? [];
  });

export const listTeamScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeIds?: string[]; weeks?: number }) => d)
  .handler(async ({ data, context }) => {
    const weeks = Math.min(52, data.weeks ?? 12);
    const since = new Date();
    since.setDate(since.getDate() - weeks * 7);
    let q = context.supabase
      .from("weekly_scores")
      .select("*, employee:profiles!weekly_scores_employee_id_fkey(id, full_name, department)")
      .gte("week_start", since.toISOString().slice(0, 10))
      .order("week_start", { ascending: false });
    if (data.employeeIds?.length) q = q.in("employee_id", data.employeeIds);
    const { data: rows } = await q;
    return rows ?? [];
  });
