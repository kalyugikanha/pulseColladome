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

    // HR admins can't create admins or super admins, but can set a tentative salary
    if (!isSuper) {
      if (role === "admin" || role === "hr_admin") role = "employee";
      isSuperAdmin = false;
    }

    const full_name = (data.full_name ?? email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())).trim();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: grantErr } = await supabaseAdmin.from("role_grants").upsert({
      email,
      role,
      is_super_admin: isSuperAdmin,
      default_monthly_salary: defaultSalary,
      department: data.department ?? null,
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
      const profileUpdate: ProfilePatch = { must_change_password: true };
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

    const patch: ProfilePatch = {};
    for (const k of ["full_name","department","date_of_birth","joined_on","phone","employment_type","notes"] as const) {
      if (data[k] !== undefined) (patch as Record<string, unknown>)[k] = data[k];
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

type TeamEntry = {
  comp_type?: "monthly" | "hourly";
  hourly_rate?: number;
  email: string;
  full_name: string;
  role: Role;
  is_super_admin: boolean;
  monthly_salary: number;
  department: string;
};

const TEAM_ROSTER: TeamEntry[] = [
  { email: "arti@colladome.com",              full_name: "Arti Kumawat",           role: "admin",           is_super_admin: true,  monthly_salary: 60000, department: "Operations" },
  { email: "shraddha.saxena@colladome.in",    full_name: "Shraddha Saxena",        role: "hr_admin",        is_super_admin: false, monthly_salary: 15000, department: "HR" },
  { email: "sweksha@colladome.in",            full_name: "Sweksha Jadon",          role: "hr_admin",        is_super_admin: false, monthly_salary: 5000,  department: "HR" },
  { email: "akash@colladome.in",              full_name: "Akash Jangid",           role: "project_manager", is_super_admin: false, monthly_salary: 40000, department: "Project Management" },
  { email: "kanishka@colladome.in",           full_name: "Kanishka Khunteta",      role: "employee",        is_super_admin: false, monthly_salary: 35000, department: "Marketing" },
  { email: "deepak@colladome.in",             full_name: "Deepak Patel",           role: "employee",        is_super_admin: false, monthly_salary: 20000, department: "Marketing" },
  { email: "sandeep@colladome.in",            full_name: "Sandeep Kumar Mandal",   role: "employee",        is_super_admin: false, monthly_salary: 13000, department: "Marketing" },
  { email: "anjali@colladome.in",             full_name: "Anjali",                 role: "employee",        is_super_admin: false, monthly_salary: 6000,  department: "Marketing" },
  { email: "hemanth@colladome.in",            full_name: "Addala Hemanth Sridhar", role: "employee",        is_super_admin: false, monthly_salary: 10000, department: "Marketing" },
  { email: "manvi@colladome.in",              full_name: "Manvi",                  role: "employee",        is_super_admin: false, monthly_salary: 5000,  department: "Marketing" },
  { email: "trisha@colladome.in",             full_name: "Trisha",                 role: "employee",        is_super_admin: false, monthly_salary: 5000,  department: "Marketing" },
  { email: "jagjeet@colladome.in",            full_name: "Jagjeet Singh Jassal",   role: "employee",        is_super_admin: false, monthly_salary: 28000, department: "Business Development" },
  { email: "chirag@colladome.com",            full_name: "Chirag Bansal",          role: "employee",        is_super_admin: false, monthly_salary: 30000, department: "Business Development" },
  { email: "juhi@colladome.com",              full_name: "Juhi",                   role: "employee",        is_super_admin: false, monthly_salary: 20000, department: "Business Development" },
  { email: "neetu@colladome.in",              full_name: "Neetu Rauniyar",         role: "employee",        is_super_admin: false, monthly_salary: 2000,  department: "Business Development" },
  { email: "sarita@colladome.in",             full_name: "Sarita Kumari",          role: "employee",        is_super_admin: false, monthly_salary: 0,     department: "Business Development" },
  { email: "riyanshi@colladome.in",           full_name: "Riyanshi Sharma",        role: "employee",        is_super_admin: false, monthly_salary: 0,     department: "Business Development" },
  { email: "arpit@colladome.in",              full_name: "Arpit Kast",             role: "employee",        is_super_admin: false, monthly_salary: 0,     department: "Development", comp_type: "hourly", hourly_rate: 400 },
];

export const bulkProvisionTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: superRow } = await context.supabase
      .from("super_admins").select("user_id").eq("user_id", context.userId).maybeSingle();
    if (!superRow) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const created: string[] = [];
    const updated: string[] = [];
    const errors: { email: string; message: string }[] = [];

    for (const entry of TEAM_ROSTER) {
      const em = entry.email.toLowerCase();
      try {
        const { error: grantErr } = await supabaseAdmin.from("role_grants").upsert({
          email: em,
          role: entry.role,
          is_super_admin: entry.is_super_admin,
          default_monthly_salary: entry.monthly_salary,
          department: entry.department,
        }, { onConflict: "email" });
        if (grantErr) throw new Error(`role_grants: ${grantErr.message}`);

        const { data: existing } = await supabaseAdmin
          .from("profiles").select("id, full_name, department").eq("email", em).maybeSingle();

        if (existing) {
          const patch: { department: string; full_name?: string } = { department: entry.department };
          const currentName = (existing.full_name ?? "").trim().toLowerCase();
          const emailLocal = em.split("@")[0].toLowerCase();
          if (!currentName || currentName === emailLocal) {
            patch.full_name = entry.full_name;
          }
          const { error: pErr } = await supabaseAdmin.from("profiles").update(patch).eq("id", existing.id);
          if (pErr) throw new Error(`profiles: ${pErr.message}`);

          const { error: rErr } = await supabaseAdmin.from("user_roles")
            .upsert({ user_id: existing.id, role: entry.role }, { onConflict: "user_id,role" });
          if (rErr) throw new Error(`user_roles: ${rErr.message}`);
          if (entry.is_super_admin) {
            await supabaseAdmin.from("super_admins").upsert({ user_id: existing.id }, { onConflict: "user_id" });
            await supabaseAdmin.from("user_roles")
              .upsert({ user_id: existing.id, role: "admin" }, { onConflict: "user_id,role" });
          }

          const { error: sErr } = await supabaseAdmin.from("salaries").upsert({
            user_id: existing.id,
            monthly_salary: entry.monthly_salary,
            effective_from: new Date().toISOString().slice(0, 10),
            currency: "INR",
          }, { onConflict: "user_id,effective_from" });
          if (sErr) throw new Error(`salaries: ${sErr.message}`);

          updated.push(em);
        } else {
          const { error: cErr } = await supabaseAdmin.auth.admin.createUser({
            email: em,
            password: "Test@123",
            email_confirm: true,
            user_metadata: { full_name: entry.full_name },
          });
          if (cErr) {
            if (/already registered|already exists|duplicate/i.test(cErr.message)) {
              updated.push(em);
            } else {
              throw new Error(cErr.message);
            }
          } else {
            created.push(em);
          }
        }
      } catch (e: unknown) {
        errors.push({ email: em, message: e instanceof Error ? e.message : String(e) });
      }
    }

    return { created, updated, errors };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; active: boolean }) => input)
  .handler(async ({ data, context }) => {
    const [{ data: superRow }, { data: roleRows }] = await Promise.all([
      context.supabase.from("super_admins").select("user_id").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    if (!superRow && !roleRows?.some((r) => r.role === "hr_admin")) throw new Error("Forbidden");
    if (data.user_id === context.userId) throw new Error("You cannot deactivate your own account");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch = data.active
      ? { is_active: true, deactivated_at: null, deactivated_by: null }
      : { is_active: false, deactivated_at: new Date().toISOString(), deactivated_by: context.userId };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any).from("profiles").update(patch).eq("id", data.user_id);
    if (error) throw new Error(error.message);

    if (!data.active) {
      try { await supabaseAdmin.auth.admin.signOut(data.user_id); } catch { /* noop */ }
    }
    return { ok: true };
  });

export const deleteUserPermanently = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: superRow } = await context.supabase
      .from("super_admins").select("user_id").eq("user_id", context.userId).maybeSingle();
    if (!superRow) throw new Error("Only super admins can permanently delete users");
    if (data.user_id === context.userId) throw new Error("You cannot delete your own account");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prof } = await supabaseAdmin
      .from("profiles").select("email").eq("id", data.user_id).maybeSingle();
    const email = prof?.email?.toLowerCase() ?? null;

    const userTables = [
      "attendance_logs", "punch_sessions", "leave_balances", "leave_requests",
      "salaries", "employee_bank_details", "employee_documents",
      "google_calendar_tokens", "user_task_presets", "department_heads",
      "super_admins", "user_roles",
    ] as const;
    for (const t of userTables) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any).from(t).delete().eq("user_id", data.user_id);
    }
    if (email) {
      await supabaseAdmin.from("role_grants").delete().eq("email", email);
    }
    await supabaseAdmin.from("profiles").delete().eq("id", data.user_id);

    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (authErr && !/not.?found/i.test(authErr.message)) throw new Error(authErr.message);

    return { ok: true };
  });


