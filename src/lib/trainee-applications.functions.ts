import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TraineeApplication = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
};

async function assertHrOrSuper(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: sa }, { data: roles }] = await Promise.all([
    supabaseAdmin.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const isSuper = !!sa;
  const isHr = (roles ?? []).some((r) => r.role === "hr_admin" || r.role === "admin");
  if (!isSuper && !isHr) {
    throw new Error("Only HR admins and super admins may perform this action.");
  }
  return { isSuper, isHr };
}

export const submitTraineeApplication = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        full_name: z.string().trim().min(1, "Name is required").max(120),
        email: z.string().trim().toLowerCase().email("Valid email is required").max(255),
        phone: z.string().trim().max(30).optional().or(z.literal("")),
        note: z.string().trim().max(2000).optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.from("trainee_applications").insert({
      full_name: data.full_name,
      email: data.email,
      phone: data.phone || null,
      note: data.note || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTraineeApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TraineeApplication[]> => {
    await assertHrOrSuper(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("trainee_applications")
      .select("id, full_name, email, phone, note, status, rejection_reason, reviewed_at, reviewed_by, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as TraineeApplication[];
  });

export const approveTraineeApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertHrOrSuper(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app, error: fetchErr } = await supabaseAdmin
      .from("trainee_applications")
      .select("id, email, status")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!app) throw new Error("Application not found");
    if (app.status !== "pending") throw new Error("Application has already been reviewed");

    const email = app.email.toLowerCase();
    const { error: grantErr } = await supabaseAdmin
      .from("role_grants")
      .upsert({ email, role: "trainee", is_super_admin: false }, { onConflict: "email" });
    if (grantErr) throw new Error(grantErr.message);

    const { error: updErr } = await supabaseAdmin
      .from("trainee_applications")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
        rejection_reason: null,
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true, email };
  });

export const rejectTraineeApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        rejection_reason: z.string().trim().min(1, "Reason is required").max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertHrOrSuper(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app, error: fetchErr } = await supabaseAdmin
      .from("trainee_applications")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!app) throw new Error("Application not found");
    if (app.status !== "pending") throw new Error("Application has already been reviewed");
    const { error } = await supabaseAdmin
      .from("trainee_applications")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
        rejection_reason: data.rejection_reason,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
