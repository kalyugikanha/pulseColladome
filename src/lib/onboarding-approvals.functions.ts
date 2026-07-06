import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WELCOME_TASK_ASSIGNEE_EMAIL = "kanishka@colladome.in";
// "Colladome Social Media" project
const WELCOME_TASK_PROJECT_ID = "0995c181-bda4-4cf3-b1c5-73b1a1834d24";

async function assertHrOrSuper(context: {
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: unknown }>;
        } & PromiseLike<{ data: unknown }>;
      };
    };
  };
  userId: string;
}): Promise<{ isSuper: boolean; isHr: boolean }> {
  const [{ data: sa }, { data: roles }] = await Promise.all([
    (context.supabase.from("super_admins").select("user_id").eq("user_id", context.userId) as unknown as { maybeSingle: () => Promise<{ data: unknown }> }).maybeSingle(),
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId) as unknown as Promise<{ data: Array<{ role: string }> | null }>,
  ]);
  const isSuper = !!sa;
  const isHr = !!(roles as Array<{ role: string }> | null)?.some((r) => r.role === "hr_admin");
  if (!isSuper && !isHr) throw new Error("Forbidden");
  return { isSuper, isHr };
}

export const listOnboardingSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status: "pending" | "approved" | "rejected" }) => input)
  .handler(async ({ data, context }) => {
    await assertHrOrSuper(context as unknown as Parameters<typeof assertHrOrSuper>[0]);
    let q = context.supabase
      .from("profiles")
      .select("id, full_name, email, department, joined_on, onboarding_submitted_at, onboarding_approved_at, onboarding_rejected_at, onboarding_rejection_reason, hobbies, linkedin_url")
      .order("onboarding_submitted_at", { ascending: false });
    if (data.status === "pending") {
      q = q.not("onboarding_submitted_at", "is", null).is("onboarding_approved_at", null).is("onboarding_rejected_at", null);
    } else if (data.status === "approved") {
      q = q.not("onboarding_approved_at", "is", null);
    } else {
      q = q.not("onboarding_rejected_at", "is", null).is("onboarding_approved_at", null);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const approveOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertHrOrSuper(context as unknown as Parameters<typeof assertHrOrSuper>[0]);

    const nowIso = new Date().toISOString();
    const { error: upErr } = await context.supabase
      .from("profiles")
      .update({
        onboarding_approved_at: nowIso,
        onboarding_approved_by: context.userId,
        onboarding_rejected_at: null,
        onboarding_rejection_reason: null,
      })
      .eq("id", data.user_id);
    if (upErr) throw new Error(upErr.message);

    // Fetch onboarding info for the welcome post
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name, email, department, joined_on, hobbies, linkedin_url, instagram_url, twitter_url, facebook_url, phone")
      .eq("id", data.user_id)
      .maybeSingle();

    // Find Kanishka
    const { data: kanishka } = await context.supabase
      .from("profiles")
      .select("id")
      .eq("email", WELCOME_TASK_ASSIGNEE_EMAIL)
      .maybeSingle();

    if (!profile || !kanishka?.id) {
      return { ok: true as const, welcome_task_created: false };
    }

    const title = `Welcome post — ${profile.full_name ?? "New hire"}`;

    // Idempotency: don't duplicate if a task with same title exists for Kanishka in last 30 days
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await context.supabase
      .from("tasks")
      .select("id")
      .eq("assignee_id", kanishka.id)
      .eq("title", title)
      .gte("created_at", since)
      .maybeSingle();
    if (existing?.id) return { ok: true as const, welcome_task_created: false };

    const p = profile as Record<string, string | null>;
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

    const { error: taskErr } = await context.supabase.from("tasks").insert({
      project_id: WELCOME_TASK_PROJECT_ID,
      assignee_id: kanishka.id,
      title,
      description,
      priority: "medium",
      status: "todo",
      due_date: due,
      created_by: context.userId,
    });
    if (taskErr) throw new Error(taskErr.message);

    return { ok: true as const, welcome_task_created: true };
  });

export const rejectOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    await assertHrOrSuper(context as unknown as Parameters<typeof assertHrOrSuper>[0]);
    const reason = data.reason.trim();
    if (!reason) throw new Error("Rejection reason required");
    const { error } = await context.supabase
      .from("profiles")
      .update({
        onboarding_rejected_at: new Date().toISOString(),
        onboarding_rejection_reason: reason,
        onboarding_approved_at: null,
        onboarding_approved_by: null,
        onboarding_submitted_at: null,
      })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
