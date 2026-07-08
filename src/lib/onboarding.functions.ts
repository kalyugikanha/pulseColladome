import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ONBOARDING_SECTIONS,
  type OnboardingSection,
  type SectionRow,
} from "@/lib/onboarding-sections";

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
  | "profile_picture"
  | "follow_facebook"
  | "follow_instagram"
  | "follow_twitter"
  | "follow_linkedin"
  | "follow_youtube"
  | "follow_pinterest"
  | "follow_whatsapp"
  | "review_google_jaipur"
  | "review_google_hyderabad"
  | "review_glassdoor"
  | "review_ambitionbox"
  | "linkedin_employment";

// Per-section field/document requirements
const PERSONAL_FIELDS = [
  "full_name","personal_email","phone","permanent_address","date_of_birth",
  "linkedin_url","github_url","facebook_url","instagram_url","twitter_url",
] as const;

const WORK_FIELDS = [
  "department","day_start_time","standup_time",
] as const;

const BANK_FIELDS = [
  "account_holder_name","account_number","bank_branch","ifsc_code","pan_number",
] as const;

const DOCUMENT_DOCS: OnboardingDocType[] = [
  "profile_picture","offer_letter","aadhar","pan","cancelled_cheque",
  "marksheet_10","marksheet_12","graduation","resume",
];

const FOLLOW_DOCS: OnboardingDocType[] = [
  "follow_facebook","follow_instagram","follow_twitter","follow_linkedin",
  "follow_youtube","follow_pinterest","follow_whatsapp",
];

const REVIEW_DOCS: OnboardingDocType[] = [
  "review_google_jaipur","review_google_hyderabad","review_glassdoor","review_ambitionbox",
];

const LINKEDIN_EMPLOYMENT_DOCS: OnboardingDocType[] = ["linkedin_employment"];

// Which sections a given profile field / document belongs to (for auto-reset on edit)
function sectionsForProfileField(field: string): OnboardingSection[] {
  const out: OnboardingSection[] = [];
  if ((PERSONAL_FIELDS as readonly string[]).includes(field) || field === "marriage_anniversary" || field === "youtube_url" || field === "pinterest_url" || field === "hobbies") out.push("personal");
  if ((WORK_FIELDS as readonly string[]).includes(field)) out.push("work");
  return out;
}

function sectionForDoc(doc: OnboardingDocType): OnboardingSection {
  if (DOCUMENT_DOCS.includes(doc)) return "documents";
  if (FOLLOW_DOCS.includes(doc)) return "follow";
  if (REVIEW_DOCS.includes(doc)) return "reviews";
  if (LINKEDIN_EMPLOYMENT_DOCS.includes(doc)) return "linkedin_employment";
  return "documents";
}

type SectionValidationResult = { ok: true } | { ok: false; missing: string[] };

function validateSection(
  section: OnboardingSection,
  profile: Record<string, unknown> | null,
  bank: Record<string, unknown> | null,
  uploaded: Set<OnboardingDocType>,
): SectionValidationResult {
  const missing: string[] = [];
  const p = profile ?? {};
  const check = (fields: readonly string[], src: Record<string, unknown>) => {
    for (const f of fields) {
      const v = src[f];
      if (v === null || v === undefined || String(v).trim() === "") missing.push(f);
    }
  };
  switch (section) {
    case "personal":
      check(PERSONAL_FIELDS, p);
      break;
    case "work":
      check(WORK_FIELDS, p);
      break;
    case "bank": {
      if (!bank) { missing.push("bank"); break; }
      check(BANK_FIELDS, bank);
      const ifsc = String(bank.ifsc_code ?? "").toUpperCase();
      if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) missing.push("ifsc_code (invalid)");
      const pan = String(bank.pan_number ?? "").toUpperCase();
      if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) missing.push("pan_number (invalid)");
      break;
    }
    case "documents":
      for (const d of DOCUMENT_DOCS) if (!uploaded.has(d)) missing.push(d);
      break;
    case "follow":
      for (const d of FOLLOW_DOCS) if (!uploaded.has(d)) missing.push(d);
      break;
    case "reviews":
      for (const d of REVIEW_DOCS) if (!uploaded.has(d)) missing.push(d);
      break;
    case "linkedin_employment":
      for (const d of LINKEDIN_EMPLOYMENT_DOCS) if (!uploaded.has(d)) missing.push(d);
      break;
  }
  return missing.length ? { ok: false, missing } : { ok: true };
}

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
  hobbies?: string | null;
};

type BankPatch = {
  account_holder_name?: string;
  account_number?: string;
  bank_branch?: string;
  ifsc_code?: string;
  pan_number?: string;
};

type SupabaseLoose = {
  from: (t: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (c?: string) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (v: Record<string, unknown>) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upsert: (v: unknown, o?: unknown) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insert: (v: unknown) => any;
  };
};

async function loadSections(supabase: SupabaseLoose, uid: string): Promise<SectionRow[]> {
  const { data } = await supabase
    .from("onboarding_section_state")
    .select("section, required, status, submitted_at, approved_at, rejected_at, rejection_reason")
    .eq("user_id", uid);
  const rows = (data ?? []) as SectionRow[];
  // Ensure all 7 sections exist (defensive)
  const bySection = new Map(rows.map((r) => [r.section, r]));
  return ONBOARDING_SECTIONS.map((s) => bySection.get(s) ?? {
    section: s, required: true, status: "draft" as const,
    submitted_at: null, approved_at: null, rejected_at: null, rejection_reason: null,
  });
}

// Move any approved sections listed in `sections` back to draft (so HR re-reviews).
async function resetApprovedSections(
  supabase: SupabaseLoose, uid: string, sections: OnboardingSection[],
): Promise<void> {
  if (!sections.length) return;
  await supabase
    .from("onboarding_section_state")
    .update({
      status: "draft",
      approved_at: null,
      approved_by: null,
      submitted_at: null,
    })
    .eq("user_id", uid)
    .in("section", sections)
    .eq("status", "approved");
}

export const getMyOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const supabase = context.supabase as unknown as SupabaseLoose;
    const [{ data: profile }, { data: bank }, { data: docs }, sections] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("employee_bank_details").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("employee_documents").select("doc_type, storage_path, uploaded_at").eq("user_id", uid),
      loadSections(supabase, uid),
    ]);
    return {
      profile: profile ?? null,
      bank: bank ?? null,
      documents: (docs ?? []) as { doc_type: OnboardingDocType; storage_path: string; uploaded_at: string }[],
      sections,
    };
  });

export const saveMyOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profile?: ProfilePatch; bank?: BankPatch }) => input)
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const supabase = context.supabase as unknown as SupabaseLoose;

    const touchedSections = new Set<OnboardingSection>();

    if (data.profile && Object.keys(data.profile).length > 0) {
      const { error } = await supabase.from("profiles").update(data.profile).eq("id", uid);
      if (error) throw new Error(error.message);
      for (const f of Object.keys(data.profile)) {
        for (const s of sectionsForProfileField(f)) touchedSections.add(s);
      }
    }

    if (data.bank) {
      const b = data.bank;
      const hasAny = Object.values(b).some((v) => v !== undefined && v !== null && String(v).trim() !== "");
      if (hasAny) {
        const { data: existing } = await supabase
          .from("employee_bank_details").select("*").eq("user_id", uid).maybeSingle();
        const merged = {
          user_id: uid,
          account_holder_name: b.account_holder_name ?? existing?.account_holder_name ?? "",
          account_number: b.account_number ?? existing?.account_number ?? "",
          bank_branch: b.bank_branch ?? existing?.bank_branch ?? "",
          ifsc_code: (b.ifsc_code ?? existing?.ifsc_code ?? "").toUpperCase(),
          pan_number: (b.pan_number ?? existing?.pan_number ?? "").toUpperCase(),
        };
        if (Object.values(merged).every((v) => String(v).trim() !== "")) {
          const { error } = await supabase.from("employee_bank_details").upsert(merged, { onConflict: "user_id" });
          if (error) throw new Error(error.message);
        } else if (existing) {
          const patch: BankPatch = {};
          for (const k of BANK_FIELDS) {
            const v = b[k];
            if (v !== undefined) patch[k] = (k === "ifsc_code" || k === "pan_number") ? String(v).toUpperCase() : String(v);
          }
          if (Object.keys(patch).length) {
            const { error } = await supabase.from("employee_bank_details").update(patch).eq("user_id", uid);
            if (error) throw new Error(error.message);
          }
        }
        touchedSections.add("bank");
      }
    }

    // Reset any previously-approved touched sections back to draft.
    await resetApprovedSections(supabase, uid, Array.from(touchedSections));
    return { ok: true };
  });

export const recordMyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { doc_type: OnboardingDocType; storage_path: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseLoose;
    const { error } = await supabase.from("employee_documents").upsert({
      user_id: context.userId,
      doc_type: data.doc_type,
      storage_path: data.storage_path,
    }, { onConflict: "user_id,doc_type" });
    if (error) throw new Error(error.message);
    await resetApprovedSections(supabase, context.userId, [sectionForDoc(data.doc_type)]);
    return { ok: true };
  });

// Submit a single section for HR approval. Validates that section's requirements.
export const submitOnboardingSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { section: OnboardingSection }) => input)
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const supabase = context.supabase as unknown as SupabaseLoose;
    const [{ data: profile }, { data: bank }, { data: docs }, { data: row }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("employee_bank_details").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("employee_documents").select("doc_type").eq("user_id", uid),
      supabase.from("onboarding_section_state").select("*").eq("user_id", uid).eq("section", data.section).maybeSingle(),
    ]);
    if (!row) throw new Error("Section not found");
    if (row.status === "submitted" || row.status === "approved") {
      return { ok: false as const, reason: "already_submitted" as const };
    }
    const uploaded = new Set(((docs ?? []) as Array<{ doc_type: OnboardingDocType }>).map((d) => d.doc_type));
    const res = validateSection(
      data.section,
      profile as Record<string, unknown> | null,
      bank as Record<string, unknown> | null,
      uploaded,
    );
    if (!res.ok) return { ok: false as const, reason: "incomplete" as const, missing: res.missing };

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("onboarding_section_state")
      .update({ status: "submitted", submitted_at: now, rejected_at: null, rejection_reason: null })
      .eq("user_id", uid)
      .eq("section", data.section);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getEmployeeDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; doc_type: OnboardingDocType }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseLoose;
    const [{ data: sa }, { data: roles }] = await Promise.all([
      supabase.from("super_admins").select("user_id").eq("user_id", context.userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    if (!sa && !(roles as Array<{ role: string }> | null)?.some((r) => r.role === "hr_admin")) throw new Error("Forbidden");

    const { data: doc, error: dErr } = await supabase
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
      .createSignedUrl((doc as { storage_path: string }).storage_path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const getEmployeeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseLoose;
    const [{ data: sa }, { data: roles }] = await Promise.all([
      supabase.from("super_admins").select("user_id").eq("user_id", context.userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    if (!sa && !(roles as Array<{ role: string }> | null)?.some((r) => r.role === "hr_admin")) throw new Error("Forbidden");

    const [{ data: profile }, { data: bank }, { data: docs }, sections] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", data.user_id).maybeSingle(),
      supabase.from("employee_bank_details").select("*").eq("user_id", data.user_id).maybeSingle(),
      supabase.from("employee_documents").select("doc_type, uploaded_at").eq("user_id", data.user_id),
      loadSections(supabase, data.user_id),
    ]);
    return {
      profile: profile ?? null,
      bank: bank ?? null,
      documents: (docs ?? []) as { doc_type: OnboardingDocType; uploaded_at: string }[],
      sections,
    };
  });
