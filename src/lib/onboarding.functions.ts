import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OnboardingDocType =
  | "offer_letter"
  | "aadhar"
  | "pan"
  | "cancelled_cheque"
  | "marksheet_10"
  | "marksheet_12"
  | "graduation"
  | "masters"
  | "resume"
  | "profile_picture";

const REQUIRED_PROFILE_FIELDS = [
  "full_name","email","personal_email","phone","permanent_address","date_of_birth",
  "linkedin_url","github_url","facebook_url","instagram_url","twitter_url",
  "department","joined_on","day_start_time","standup_time",
] as const;

const REQUIRED_BANK_FIELDS = [
  "account_holder_name","account_number","bank_branch","ifsc_code","pan_number",
] as const;

const REQUIRED_DOCS: OnboardingDocType[] = [
  "offer_letter","aadhar","pan","cancelled_cheque",
  "marksheet_10","marksheet_12","graduation","resume","profile_picture",
];

type ProfilePatch = {
  full_name?: string | null;
  personal_email?: string | null;
  phone?: string | null;
  permanent_address?: string | null;
  date_of_birth?: string | null;
  marriage_anniversary?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  twitter_url?: string | null;
  youtube_url?: string | null;
  pinterest_url?: string | null;
  profile_picture_url?: string | null;
  department?: string | null;
  day_start_time?: string | null;
  standup_time?: string | null;
  social_follows_confirmed_at?: string | null;
  reviews_confirmed_at?: string | null;
};


type BankPatch = {
  account_holder_name?: string;
  account_number?: string;
  bank_branch?: string;
  ifsc_code?: string;
  pan_number?: string;
};

export const getMyOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const [{ data: profile }, { data: bank }, { data: docs }] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      context.supabase.from("employee_bank_details").select("*").eq("user_id", uid).maybeSingle(),
      context.supabase.from("employee_documents").select("doc_type, storage_path, uploaded_at").eq("user_id", uid),
    ]);
    return {
      profile: profile ?? null,
      bank: bank ?? null,
      documents: (docs ?? []) as { doc_type: OnboardingDocType; storage_path: string; uploaded_at: string }[],
    };
  });

export const saveMyOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profile?: ProfilePatch; bank?: BankPatch }) => input)
  .handler(async ({ data, context }) => {
    const uid = context.userId;

    if (data.profile && Object.keys(data.profile).length > 0) {
      const { error } = await context.supabase.from("profiles").update(data.profile).eq("id", uid);
      if (error) throw new Error(error.message);
    }

    if (data.bank) {
      const b = data.bank;
      const hasAny = Object.values(b).some((v) => v !== undefined && v !== null && String(v).trim() !== "");
      if (hasAny) {
        // Upsert requires all NOT NULL fields; fetch existing first and merge
        const { data: existing } = await context.supabase
          .from("employee_bank_details").select("*").eq("user_id", uid).maybeSingle();
        const merged = {
          user_id: uid,
          account_holder_name: b.account_holder_name ?? existing?.account_holder_name ?? "",
          account_number: b.account_number ?? existing?.account_number ?? "",
          bank_branch: b.bank_branch ?? existing?.bank_branch ?? "",
          ifsc_code: (b.ifsc_code ?? existing?.ifsc_code ?? "").toUpperCase(),
          pan_number: (b.pan_number ?? existing?.pan_number ?? "").toUpperCase(),
        };
        // If any required field still empty, skip upsert and just return; validation runs on submit
        if (Object.values(merged).every((v) => String(v).trim() !== "")) {
          const { error } = await context.supabase.from("employee_bank_details").upsert(merged, { onConflict: "user_id" });
          if (error) throw new Error(error.message);
        } else {
          // Partial save: update existing row if present, else silently skip
          if (existing) {
            const patch: BankPatch = {};
            for (const k of REQUIRED_BANK_FIELDS) {
              const v = b[k];
              if (v !== undefined) patch[k] = (k === "ifsc_code" || k === "pan_number") ? String(v).toUpperCase() : String(v);
            }
            if (Object.keys(patch).length) {
              const { error } = await context.supabase.from("employee_bank_details").update(patch).eq("user_id", uid);
              if (error) throw new Error(error.message);
            }
          }
        }
      }
    }
    return { ok: true };
  });

export const recordMyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { doc_type: OnboardingDocType; storage_path: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("employee_documents").upsert({
      user_id: context.userId,
      doc_type: data.doc_type,
      storage_path: data.storage_path,
    }, { onConflict: "user_id,doc_type" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const completeMyOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const [{ data: profile }, { data: bank }, { data: docs }] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      context.supabase.from("employee_bank_details").select("*").eq("user_id", uid).maybeSingle(),
      context.supabase.from("employee_documents").select("doc_type").eq("user_id", uid),
    ]);

    const missing: string[] = [];
    const p = (profile ?? {}) as Record<string, unknown>;
    for (const f of REQUIRED_PROFILE_FIELDS) {
      const v = p[f];
      if (v === null || v === undefined || String(v).trim() === "") missing.push(`profile.${f}`);
    }
    if (!bank) {
      missing.push("bank.*");
    } else {
      const bb = bank as Record<string, unknown>;
      for (const f of REQUIRED_BANK_FIELDS) {
        const v = bb[f];
        if (v === null || v === undefined || String(v).trim() === "") missing.push(`bank.${f}`);
      }
      // Format validation
      const ifsc = String(bb.ifsc_code ?? "").toUpperCase();
      if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) missing.push("bank.ifsc_code (invalid format)");
      const pan = String(bb.pan_number ?? "").toUpperCase();
      if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) missing.push("bank.pan_number (invalid format)");
    }
    const uploaded = new Set((docs ?? []).map((d) => d.doc_type as OnboardingDocType));
    for (const d of REQUIRED_DOCS) if (!uploaded.has(d)) missing.push(`document.${d}`);

    if (!p.social_follows_confirmed_at) missing.push("confirm.follow_social_channels");
    if (!p.reviews_confirmed_at) missing.push("confirm.leave_reviews");

    if (missing.length) return { ok: false as const, missing };

    const { error } = await context.supabase
      .from("profiles")
      .update({ onboarding_completed: true, onboarding_completed_at: new Date().toISOString() })
      .eq("id", uid);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

      .from("profiles")
      .update({ onboarding_completed: true, onboarding_completed_at: new Date().toISOString() })
      .eq("id", uid);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getEmployeeDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; doc_type: OnboardingDocType }) => input)
  .handler(async ({ data, context }) => {
    // Verify caller is super or HR admin
    const [{ data: sa }, { data: roles }] = await Promise.all([
      context.supabase.from("super_admins").select("user_id").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    if (!sa && !roles?.some((r) => r.role === "hr_admin")) throw new Error("Forbidden");

    const { data: doc, error: dErr } = await context.supabase
      .from("employee_documents")
      .select("storage_path")
      .eq("user_id", data.user_id)
      .eq("doc_type", data.doc_type)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!doc) throw new Error("Not uploaded");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("employee-documents")
      .createSignedUrl(doc.storage_path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const getEmployeeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string }) => input)
  .handler(async ({ data, context }) => {
    const [{ data: sa }, { data: roles }] = await Promise.all([
      context.supabase.from("super_admins").select("user_id").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    if (!sa && !roles?.some((r) => r.role === "hr_admin")) throw new Error("Forbidden");

    const [{ data: profile }, { data: bank }, { data: docs }] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", data.user_id).maybeSingle(),
      context.supabase.from("employee_bank_details").select("*").eq("user_id", data.user_id).maybeSingle(),
      context.supabase.from("employee_documents").select("doc_type, uploaded_at").eq("user_id", data.user_id),
    ]);
    return {
      profile: profile ?? null,
      bank: bank ?? null,
      documents: (docs ?? []) as { doc_type: OnboardingDocType; uploaded_at: string }[],
    };
  });
