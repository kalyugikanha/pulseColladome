import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "employee" | "project_manager" | "hr_admin";
type EmploymentType = "full_time" | "intern" | "contract" | "consultant";

type ProfilePatch = {
  full_name?: string | null;
  department?: string | null;
  date_of_birth?: string | null;
  joined_on?: string | null;
  phone?: string | null;
  employment_type?: EmploymentType | null;
  notes?: string | null;
  must_change_password?: boolean;
};

export const createTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    email: string;
    full_name?: string;
    role?: Role;
    is_super_admin?: boolean;
    default_monthly_salary?: number | null;
    department?: string | null;
    date_of_birth?: string | null;
    joined_on?: string | null;
    phone?: string | null;
    employment_type?: EmploymentType | null;
    notes?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const [{ data: superRow }, { data: roleRows }] = await Promise.all([
      context.supabase.from("super_admins").select("user_id").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    const isSuper = !!superRow;
    const isHr = !!roleRows?.some((r) => r.role === "hr_admin");
    if (!isSuper && !isHr) throw new Error("Forbidden");

    const email = (data.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("Valid email required");

    let role: Role = data.role ?? "employee";
    let isSuperAdmin = !!data.is_super_admin;
    let defaultSalary = data.default_monthly_salary ?? null;

    // HR admins can't create admins or super admins, and can't set salaries
    if (!isSuper) {
      if (role === "admin" || role === "hr_admin") role = "employee";
      isSuperAdmin = false;
      defaultSalary = null;
    }

    const full_name = (data.full_name ?? email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())).trim();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: grantErr } = await supabaseAdmin.from("role_grants").upsert({
      email,
      role,
      is_super_admin: isSuperAdmin,
      default_monthly_salary: defaultSalary,
    }, { onConflict: "email" });
    if (grantErr) throw new Error(grantErr.message);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: "Test@123",
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (error) throw new Error(error.message);

    const newId = created?.user?.id;
    if (newId) {
      const profileUpdate: Record<string, unknown> = { must_change_password: true };
      if (data.department !== undefined) profileUpdate.department = data.department;
      if (data.date_of_birth !== undefined) profileUpdate.date_of_birth = data.date_of_birth;
      if (data.joined_on !== undefined) profileUpdate.joined_on = data.joined_on;
      if (data.phone !== undefined) profileUpdate.phone = data.phone;
      if (data.employment_type !== undefined) profileUpdate.employment_type = data.employment_type;
      if (data.notes !== undefined) profileUpdate.notes = data.notes;
      await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", newId);
    }

    return { ok: true, email, temporary_password: "Test@123" as const, user_id: newId ?? null };
  });

export const updateEmployeeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    user_id: string;
    full_name?: string | null;
    department?: string | null;
    date_of_birth?: string | null;
    joined_on?: string | null;
    phone?: string | null;
    employment_type?: EmploymentType | null;
    notes?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const [{ data: superRow }, { data: roleRows }] = await Promise.all([
      context.supabase.from("super_admins").select("user_id").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    if (!superRow && !roleRows?.some((r) => r.role === "hr_admin")) throw new Error("Forbidden");

    const patch: Record<string, unknown> = {};
    for (const k of ["full_name","department","date_of_birth","joined_on","phone","employment_type","notes"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (Object.keys(patch).length === 0) return { ok: true };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const provisionPendingUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Only super admins may bulk-provision users
    const { data: superRow, error: rpcErr } = await context.supabase.from("super_admins").select("user_id").eq("user_id", context.userId).maybeSingle();
    if (rpcErr) throw new Error(rpcErr.message);
    if (!superRow) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
