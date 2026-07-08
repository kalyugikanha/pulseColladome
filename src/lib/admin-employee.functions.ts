import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OnboardingDocType } from "./onboarding.functions";

type ProfilePatch = Partial<{
  full_name: string | null;
  personal_email: string | null;
  phone: string | null;
  permanent_address: string | null;
  date_of_birth: string | null;
  marriage_anniversary: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
  pinterest_url: string | null;
  profile_picture_url: string | null;
  department: string | null;
  employment_type: string | null;
  joined_on: string | null;
  reporting_manager_id: string | null;
  day_start_time: string | null;
  standup_time: string | null;
  hobbies: string | null;
  notes: string | null;
  onboarding_required: boolean;
}>;

type BankPatch = Partial<{
  account_holder_name: string;
  account_number: string;
  bank_branch: string;
  ifsc_code: string;
  pan_number: string;
}>;

async function assertSuperAdmin(context: { supabase: ReturnType<typeof Object>; userId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = context.supabase as any;
  const { data: sa } = await sb.from("super_admins").select("user_id").eq("user_id", context.userId).maybeSingle();
  if (!sa) throw new Error("Forbidden: super admin only");
}

export const adminGetEmployeeFull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const [{ data: profile }, { data: bank }, { data: docs }, { data: roles }, { data: sa }, { data: salary }] = await Promise.all([
      sb.from("profiles").select("*").eq("id", data.user_id).maybeSingle(),
      sb.from("employee_bank_details").select("*").eq("user_id", data.user_id).maybeSingle(),
      sb.from("employee_documents").select("doc_type, storage_path, uploaded_at").eq("user_id", data.user_id),
      sb.from("user_roles").select("role").eq("user_id", data.user_id),
      sb.from("super_admins").select("user_id").eq("user_id", data.user_id).maybeSingle(),
      sb.from("salaries").select("monthly_salary, currency, effective_from").eq("user_id", data.user_id).order("effective_from", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return {
      profile: profile ?? null,
      bank: bank ?? null,
      documents: (docs ?? []) as { doc_type: OnboardingDocType; storage_path: string; uploaded_at: string }[],
      roles: ((roles ?? []) as Array<{ role: string }>).map((r) => r.role),
      isSuperAdmin: !!sa,
      salary: salary ?? null,
    };
  });

export const adminUpdateEmployeeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; profile?: ProfilePatch; bank?: BankPatch }) => input)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    if (data.profile && Object.keys(data.profile).length > 0) {
      const { error } = await sb.from("profiles").update(data.profile).eq("id", data.user_id);
      if (error) throw new Error(error.message);
    }

    if (data.bank) {
      const b = data.bank;
      const { data: existing } = await sb.from("employee_bank_details").select("*").eq("user_id", data.user_id).maybeSingle();
      const merged = {
        user_id: data.user_id,
        account_holder_name: b.account_holder_name ?? existing?.account_holder_name ?? "",
        account_number: b.account_number ?? existing?.account_number ?? "",
        bank_branch: b.bank_branch ?? existing?.bank_branch ?? "",
        ifsc_code: (b.ifsc_code ?? existing?.ifsc_code ?? "").toUpperCase(),
        pan_number: (b.pan_number ?? existing?.pan_number ?? "").toUpperCase(),
      };
      const hasAny = Object.values(merged).some((v, i) => i > 0 && String(v).trim() !== "");
      if (hasAny) {
        const allFilled = Object.entries(merged).every(([, v]) => String(v).trim() !== "");
        if (allFilled) {
          const { error } = await sb.from("employee_bank_details").upsert(merged, { onConflict: "user_id" });
          if (error) throw new Error(error.message);
        } else if (existing) {
          const patch: Record<string, string> = {};
          for (const k of ["account_holder_name","account_number","bank_branch","ifsc_code","pan_number"] as const) {
            const v = b[k];
            if (v !== undefined) patch[k] = (k === "ifsc_code" || k === "pan_number") ? String(v).toUpperCase() : String(v);
          }
          if (Object.keys(patch).length) {
            const { error } = await sb.from("employee_bank_details").update(patch).eq("user_id", data.user_id);
            if (error) throw new Error(error.message);
          }
        }
      }
    }
    return { ok: true };
  });

export const adminRecordEmployeeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; doc_type: OnboardingDocType; storage_path: string }) => input)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { error } = await sb.from("employee_documents").upsert({
      user_id: data.user_id,
      doc_type: data.doc_type,
      storage_path: data.storage_path,
    }, { onConflict: "user_id,doc_type" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUploadEmployeeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; doc_type: OnboardingDocType; file_base64: string; ext: string; content_type?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const buf = Buffer.from(data.file_base64, "base64");
    const path = `${data.user_id}/${data.doc_type}.${(data.ext || "bin").toLowerCase()}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("employee-documents")
      .upload(path, buf, { upsert: true, contentType: data.content_type || undefined });
    if (upErr) throw new Error(upErr.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { error } = await sb.from("employee_documents").upsert({
      user_id: data.user_id,
      doc_type: data.doc_type,
      storage_path: path,
    }, { onConflict: "user_id,doc_type" });
    if (error) throw new Error(error.message);
    return { ok: true, storage_path: path };
  });
