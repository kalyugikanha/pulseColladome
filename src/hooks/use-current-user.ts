import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useViewAs } from "./use-view-as";

const FINANCE_EMAILS = ["shubham@colladome.com"];

export type CurrentUser = {
  id: string;
  realId: string;
  email: string | null;
  fullName: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isFinanceAdmin: boolean;
  isHrAdmin: boolean;
  isLearningAdmin: boolean;
  canManageProjects: boolean;
  /**
   * True only for org-wide people visibility: admin, super admin, HR admin,
   * finance admin. Department heads / reporting managers / project managers
   * are NOT people-unscoped — they see their reporting tree via
   * useVisibilityScope. Use this on screens that surface teammate lists,
   * timesheets, or approvals (e.g. Team Timesheet, Attendance team panel,
   * Project burn).
   */
  isPeopleUnscoped: boolean;
  isDepartmentHead: boolean;
  headOfDepartments: string[];
  isReportingManager: boolean;
  directReportIds: string[];
  mustChangePassword: boolean;
  onboardingCompleted: boolean;
  onboardingRequired: boolean;
  onboardingSubmittedAt: string | null;
  onboardingApprovedAt: string | null;
  onboardingRejectedAt: string | null;
  onboardingRejectionReason: string | null;
  onboardingGateBlocked: boolean;
  onboardingAnyRejected: boolean;
  onboardingAnySubmitted: boolean;
  onboardingAnyDraft: boolean;

  viewingAs: boolean;
  realIsSuperAdmin: boolean;
  realIsHrAdmin: boolean;

};


export function useCurrentUser() {
  const { viewAsUserId } = useViewAs();
  return useQuery<CurrentUser | null>({
    queryKey: ["current-user", viewAsUserId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const [{ data: profile }, { data: roles }, { data: sa }, { data: headRows }, { data: reportRows }, { data: sectionRows }] = await Promise.all([
        supabase.from("profiles").select("full_name, email, must_change_password, onboarding_completed, onboarding_required, onboarding_submitted_at, onboarding_approved_at, onboarding_rejected_at, onboarding_rejection_reason").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
        supabase.from("department_heads").select("department").eq("user_id", user.id),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("profiles").select("id").eq("reporting_manager_id", user.id),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("onboarding_section_state").select("required, status").eq("user_id", user.id),
      ]);
      const realHeadOf = (headRows ?? []).map((r) => r.department).filter((d): d is string => !!d);
      const realReportIds = ((reportRows ?? []) as Array<{ id: string }>).map((r) => r.id);
      const sections = ((sectionRows ?? []) as Array<{ required: boolean; status: string }>);
      // Onboarding gate relaxed: HR now reviews sections at their own pace.
      // Portal access is no longer blocked by unapproved sections. Data,
      // uploaded proof, and section history remain intact for HR review.
      const onboardingGateBlocked = false;
      const onboardingAnyRejected = sections.some((r) => r.status === "rejected");
      const onboardingAnySubmitted = sections.some((r) => r.status === "submitted");
      const onboardingAnyDraft = sections.some((r) => r.required && r.status === "draft");



      const isSuperAdmin = !!sa;
      const email = profile?.email ?? user.email ?? null;
      const realAdmin = isSuperAdmin || !!roles?.some((r) => r.role === "admin");
      const realFinance = isSuperAdmin || (!!email && FINANCE_EMAILS.includes(email.toLowerCase()));

      const realIsHrAdmin = !!roles?.some((r) => r.role === "hr_admin");

      // View-as override: only super admins can impersonate view. Data queries keep the real id.
      let viewingAs = false;
      let vName = profile?.full_name ?? null;
      let vEmail = email;
      let vIsAdmin = realAdmin;
      let vIsSuper = isSuperAdmin;
      let vIsFinance = realFinance;
      let vIsHr = realIsHrAdmin;
      let vCanManageProjects = realAdmin || realIsHrAdmin || realHeadOf.length > 0 || !!roles?.some((r) => r.role === "project_manager");
      let vHeadOf = realHeadOf;
      let vReportIds = realReportIds;

      if (isSuperAdmin && viewAsUserId && viewAsUserId !== user.id) {
        const { data: other } = await supabase.from("profiles").select("full_name, email").eq("id", viewAsUserId).maybeSingle();
        if (other) {
          viewingAs = true;
          vName = other.full_name ?? null;
          vEmail = other.email ?? null;
          const [{ data: otherRoles }, { data: otherSa }, { data: otherHeadRows }, { data: otherReports }] = await Promise.all([
            supabase.from("user_roles").select("role").eq("user_id", viewAsUserId),
            supabase.from("super_admins").select("user_id").eq("user_id", viewAsUserId).maybeSingle(),
            supabase.from("department_heads").select("department").eq("user_id", viewAsUserId),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any).from("profiles").select("id").eq("reporting_manager_id", viewAsUserId),
          ]);
          vIsSuper = !!otherSa;
          vIsAdmin = vIsSuper || !!otherRoles?.some((r) => r.role === "admin");
          vIsFinance = vIsSuper || (!!other.email && FINANCE_EMAILS.includes(other.email.toLowerCase()));
          vIsHr = !!otherRoles?.some((r) => r.role === "hr_admin");
          vHeadOf = (otherHeadRows ?? []).map((r) => r.department).filter((d): d is string => !!d);
          vCanManageProjects = vIsAdmin || vIsHr || vHeadOf.length > 0 || !!otherRoles?.some((r) => r.role === "project_manager");
          vReportIds = ((otherReports ?? []) as Array<{ id: string }>).map((r) => r.id);
        }
      }


      return {
        id: viewingAs && viewAsUserId ? viewAsUserId : user.id,
        realId: user.id,
        email: vEmail,
        fullName: vName,
        isAdmin: vIsAdmin,
        isSuperAdmin: vIsSuper,
        isFinanceAdmin: vIsFinance,
        isHrAdmin: vIsHr,
        canManageProjects: vCanManageProjects,
        isPeopleUnscoped: vIsAdmin || vIsSuper || vIsHr || vIsFinance,
        isDepartmentHead: vHeadOf.length > 0,
        headOfDepartments: vHeadOf,
        isReportingManager: vReportIds.length > 0,
        directReportIds: vReportIds,

        mustChangePassword: !!(profile as { must_change_password?: boolean } | null)?.must_change_password,
        onboardingCompleted: !!(profile as { onboarding_completed?: boolean } | null)?.onboarding_completed,
        onboardingRequired: (profile as { onboarding_required?: boolean } | null)?.onboarding_required !== false,
        onboardingSubmittedAt: (profile as { onboarding_submitted_at?: string | null } | null)?.onboarding_submitted_at ?? null,
        onboardingApprovedAt: (profile as { onboarding_approved_at?: string | null } | null)?.onboarding_approved_at ?? null,
        onboardingRejectedAt: (profile as { onboarding_rejected_at?: string | null } | null)?.onboarding_rejected_at ?? null,
        onboardingRejectionReason: (profile as { onboarding_rejection_reason?: string | null } | null)?.onboarding_rejection_reason ?? null,
        onboardingGateBlocked,
        onboardingAnyRejected,
        onboardingAnySubmitted,
        onboardingAnyDraft,

        viewingAs,
        realIsSuperAdmin: isSuperAdmin,
        realIsHrAdmin,
      };


    },

  });
}
