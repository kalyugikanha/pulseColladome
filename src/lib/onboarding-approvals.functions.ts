import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SECTION_LABELS, type OnboardingSection, type OnboardingSectionStatus, type SectionRow } from "@/lib/onboarding-sections";

type NotifKind = "onboarding_approved" | "onboarding_rejected" | "onboarding_required";
async function notifyEmployee(
  supabase: SupabaseLoose,
  user_id: string,
  kind: NotifKind,
  body: string,
): Promise<void> {
  try {
    await supabase.from("notifications").insert({ user_id, kind, body });
  } catch {
    // Notifications are best-effort; never block the primary action.
  }
}

const WELCOME_TASK_ASSIGNEE_EMAIL = "kanishka@colladome.in";
const WELCOME_TASK_PROJECT_ID = "0995c181-bda4-4cf3-b1c5-73b1a1834d24";

type SupabaseLoose = {
  from: (t: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (c?: string) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (v: Record<string, unknown>) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insert: (v: unknown) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upsert: (v: unknown, o?: unknown) => any;
  };
};

async function assertHrOrSuper(context: { supabase: unknown; userId: string }): Promise<void> {
  const s = context.supabase as SupabaseLoose;
  const [{ data: sa }, { data: roles }] = await Promise.all([
    s.from("super_admins").select("user_id").eq("user_id", context.userId).maybeSingle(),
    s.from("user_roles").select("role").eq("user_id", context.userId),
  ]);
  const isSuper = !!sa;
  const isHr = !!(roles as Array<{ role: string }> | null)?.some((r) => r.role === "hr_admin");
  if (!isSuper && !isHr) throw new Error("Forbidden");
}

// One row per (user, section) with the joined profile fields. Grouped in the UI.
export type SectionSubmissionRow = {
  user_id: string;
  section: OnboardingSection;
  required: boolean;
  status: OnboardingSectionStatus;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  full_name: string | null;
  email: string | null;
  department: string | null;
};

// Grouped view: one row per user, with per-section state summary.
export type EmployeeOnboardingSummary = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  sections: SectionRow[];
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  required_count: number;
  fully_approved: boolean;
  latest_submitted_at: string | null;
};

export const listOnboardingSectionSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { filter: "any_pending" | "any_rejected" | "all_approved" | "all" }) => input)
  .handler(async ({ data, context }) => {
    await assertHrOrSuper(context as unknown as { supabase: unknown; userId: string });
    const supabase = context.supabase as unknown as SupabaseLoose;

    // Pull ALL section rows + profiles. Aggregate client-side (data volume is small).
    const [{ data: sectionRows }, { data: profiles }] = await Promise.all([
      supabase.from("onboarding_section_state")
        .select("user_id, section, required, status, submitted_at, approved_at, rejected_at, rejection_reason"),
      supabase.from("profiles")
        .select("id, full_name, email, department, is_active")
        .neq("is_active", false),
    ]);

    const byUser = new Map<string, SectionRow[]>();
    for (const r of (sectionRows ?? []) as SectionRow[] & { user_id: string }[]) {
      const rr = r as unknown as SectionRow & { user_id: string };
      const list = byUser.get(rr.user_id) ?? [];
      list.push({
        section: rr.section, required: rr.required, status: rr.status,
        submitted_at: rr.submitted_at, approved_at: rr.approved_at,
        rejected_at: rr.rejected_at, rejection_reason: rr.rejection_reason,
      });
      byUser.set(rr.user_id, list);
    }

    const out: EmployeeOnboardingSummary[] = [];
    for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null; department: string | null }>) {
      const sections = byUser.get(p.id) ?? [];
      if (sections.length === 0) continue;
      const required = sections.filter((s) => s.required);
      const pending_count = required.filter((s) => s.status === "submitted").length;
      const rejected_count = required.filter((s) => s.status === "rejected").length;
      const approved_count = required.filter((s) => s.status === "approved").length;
      const fully_approved = required.length > 0 && approved_count === required.length;
      const latest_submitted_at = sections
        .map((s) => s.submitted_at)
        .filter((t): t is string => !!t)
        .sort()
        .pop() ?? null;

      const summary: EmployeeOnboardingSummary = {
        user_id: p.id,
        full_name: p.full_name,
        email: p.email,
        department: p.department,
        sections,
        pending_count,
        approved_count,
        rejected_count,
        required_count: required.length,
        fully_approved,
        latest_submitted_at,
      };

      if (data.filter === "any_pending" && pending_count === 0) continue;
      if (data.filter === "any_rejected" && rejected_count === 0) continue;
      if (data.filter === "all_approved" && !fully_approved) continue;
      out.push(summary);
    }

    out.sort((a, b) => {
      // Show pending first, most-recent submission first
      if ((b.latest_submitted_at ?? "") !== (a.latest_submitted_at ?? "")) {
        return (b.latest_submitted_at ?? "").localeCompare(a.latest_submitted_at ?? "");
      }
      return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });
    return out;
  });

export const approveOnboardingSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; section: OnboardingSection }) => input)
  .handler(async ({ data, context }) => {
    await assertHrOrSuper(context as unknown as { supabase: unknown; userId: string });
    const supabase = context.supabase as unknown as SupabaseLoose;
    const now = new Date().toISOString();
    const { error } = await supabase.from("onboarding_section_state")
      .update({
        status: "approved",
        approved_at: now,
        approved_by: context.userId,
        rejected_at: null,
        rejection_reason: null,
      })
      .eq("user_id", data.user_id)
      .eq("section", data.section);
    if (error) throw new Error(error.message);

    await notifyEmployee(
      supabase,
      data.user_id,
      "onboarding_approved",
      `${SECTION_LABELS[data.section]} was approved by HR. ✓`,
    );

    // Side effect: on "follow" approval, create the welcome-post task (once).
    let welcome_task_created = false;
    if (data.section === "follow") {
      welcome_task_created = await maybeCreateWelcomeTask(supabase, data.user_id, context.userId);
    }
    return { ok: true as const, welcome_task_created };
  });

export const rejectOnboardingSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; section: OnboardingSection; reason: string }) => input)
  .handler(async ({ data, context }) => {
    await assertHrOrSuper(context as unknown as { supabase: unknown; userId: string });
    const reason = data.reason.trim();
    if (!reason) throw new Error("Rejection reason required");
    const supabase = context.supabase as unknown as SupabaseLoose;
    const { error } = await supabase.from("onboarding_section_state")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
        approved_at: null,
        approved_by: null,
      })
      .eq("user_id", data.user_id)
      .eq("section", data.section);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setOnboardingSectionRequired = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; section: OnboardingSection; required: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertHrOrSuper(context as unknown as { supabase: unknown; userId: string });
    const supabase = context.supabase as unknown as SupabaseLoose;
    // If turning ON and section is currently approved, reset to draft so the user re-submits.
    const patch: Record<string, unknown> = { required: data.required };
    if (data.required) {
      // Only reset when currently approved
      const { data: row } = await supabase.from("onboarding_section_state")
        .select("status").eq("user_id", data.user_id).eq("section", data.section).maybeSingle();
      if ((row as { status?: string } | null)?.status === "approved") {
        patch.status = "draft";
        patch.approved_at = null;
        patch.approved_by = null;
        patch.submitted_at = null;
      }
    }
    const { error } = await supabase.from("onboarding_section_state")
      .update(patch)
      .eq("user_id", data.user_id)
      .eq("section", data.section);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

async function maybeCreateWelcomeTask(supabase: SupabaseLoose, userId: string, actorId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, department, joined_on, hobbies, linkedin_url, instagram_url, twitter_url, facebook_url, phone")
    .eq("id", userId)
    .maybeSingle();
  const { data: kanishka } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", WELCOME_TASK_ASSIGNEE_EMAIL)
    .maybeSingle();
  if (!profile || !(kanishka as { id?: string } | null)?.id) return false;

  const p = profile as Record<string, string | null>;
  const title = `Welcome post — ${p.full_name ?? "New hire"}`;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase.from("tasks")
    .select("id")
    .eq("assignee_id", (kanishka as { id: string }).id)
    .eq("title", title)
    .gte("created_at", since)
    .maybeSingle();
  if ((existing as { id?: string } | null)?.id) return false;

  const parts: Array<string | null> = [
    `**New team member:** ${p.full_name ?? "—"}`,
    p.department ? `**Department:** ${p.department}` : null,
    p.joined_on ? `**Joined on:** ${p.joined_on}` : null,
    p.hobbies ? `\n**Hobbies & interests:**\n${p.hobbies}` : null,
    "",
    "**Socials to tag / link:**",
    p.linkedin_url ? `- LinkedIn: ${p.linkedin_url}` : null,
    p.instagram_url ? `- Instagram: ${p.instagram_url}` : null,
    p.twitter_url ? `- X / Twitter: ${p.twitter_url}` : null,
    p.facebook_url ? `- Facebook: ${p.facebook_url}` : null,
    "",
    "Please create a welcome post announcing this new hire on Colladome's social channels. Profile picture is on file in HR onboarding.",
  ];
  const description = parts.filter((v): v is string => v !== null).join("\n");
  const due = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { error } = await supabase.from("tasks").insert({
    project_id: WELCOME_TASK_PROJECT_ID,
    assignee_id: (kanishka as { id: string }).id,
    title, description,
    priority: "medium", status: "todo",
    due_date: due,
    created_by: actorId,
  });
  if (error) throw new Error(error.message);
  return true;
}
