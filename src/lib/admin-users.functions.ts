import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "employee" | "project_manager";

export const createTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    email: string;
    full_name?: string;
    role?: Role;
    is_super_admin?: boolean;
    default_monthly_salary?: number | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: superRow, error: rpcErr } = await context.supabase.from("super_admins").select("user_id").eq("user_id", context.userId).maybeSingle();
    if (rpcErr) throw new Error(rpcErr.message);
    if (!superRow) throw new Error("Forbidden");

    const email = (data.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("Valid email required");
    const role: Role = data.role ?? "employee";
    const full_name = (data.full_name ?? email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())).trim();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: grantErr } = await supabaseAdmin.from("role_grants").upsert({
      email,
      role,
      is_super_admin: !!data.is_super_admin,
      default_monthly_salary: data.default_monthly_salary ?? null,
    }, { onConflict: "email" });
    if (grantErr) throw new Error(grantErr.message);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: "Test@123",
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (error) throw new Error(error.message);

    if (created?.user?.id) {
      await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("id", created.user.id);
    }

    return { ok: true, email, temporary_password: "Test@123" as const };
  });



export const provisionPendingUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Only super admins may provision users
    const { data: isSuper, error: rpcErr } = await context.supabase.rpc("is_super_admin", { _user_id: context.userId });
    if (rpcErr) throw new Error(rpcErr.message);
    if (!isSuper) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load grants + existing profile emails
    const [{ data: grants, error: gErr }, { data: profiles, error: pErr }] = await Promise.all([
      supabaseAdmin.from("role_grants").select("email"),
      supabaseAdmin.from("profiles").select("email"),
    ]);
    if (gErr) throw new Error(gErr.message);
    if (pErr) throw new Error(pErr.message);

    const existing = new Set((profiles ?? []).map((p) => (p.email ?? "").toLowerCase()).filter(Boolean));

    const created: string[] = [];
    const skipped: string[] = [];
    const errors: { email: string; message: string }[] = [];

    const nameFromEmail = (e: string) =>
      e.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    for (const g of grants ?? []) {
      const email = (g.email ?? "").trim();
      if (!email) continue;
      if (existing.has(email.toLowerCase())) { skipped.push(email); continue; }
      const { error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: "Test@123",
        email_confirm: true,
        user_metadata: { full_name: nameFromEmail(email) },
      });
      if (error) {
        // Account may already exist in auth without a profile row; treat as skipped/known
        if (/already registered|already exists|duplicate/i.test(error.message)) {
          skipped.push(email);
        } else {
          errors.push({ email, message: error.message });
        }
      } else {
        created.push(email);
      }
    }

    return { created, skipped, errors };
  });
