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
  canManageProjects: boolean;
  mustChangePassword: boolean;
  viewingAs: boolean;
  realIsSuperAdmin: boolean;

};

export function useCurrentUser() {
  const { viewAsUserId } = useViewAs();
  return useQuery<CurrentUser | null>({
    queryKey: ["current-user", viewAsUserId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const [{ data: profile }, { data: roles }, { data: sa }] = await Promise.all([
        supabase.from("profiles").select("full_name, email, must_change_password").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
      ]);
      const isSuperAdmin = !!sa;
      const email = profile?.email ?? user.email ?? null;
      const realAdmin = isSuperAdmin || !!roles?.some((r) => r.role === "admin");
      const realFinance = !!email && FINANCE_EMAILS.includes(email.toLowerCase());

      // View-as override: only super admins can impersonate view. Data queries keep the real id.
      let viewingAs = false;
      let vName = profile?.full_name ?? null;
      let vEmail = email;
      let vIsAdmin = realAdmin;
      let vIsSuper = isSuperAdmin;
      let vIsFinance = realFinance;
      if (isSuperAdmin && viewAsUserId && viewAsUserId !== user.id) {
        const { data: other } = await supabase.from("profiles").select("full_name, email").eq("id", viewAsUserId).maybeSingle();
        if (other) {
          viewingAs = true;
          vName = other.full_name ?? null;
          vEmail = other.email ?? null;
          const { data: otherRoles } = await supabase.from("user_roles").select("role").eq("user_id", viewAsUserId);
          const { data: otherSa } = await supabase.from("super_admins").select("user_id").eq("user_id", viewAsUserId).maybeSingle();
          vIsSuper = !!otherSa;
          vIsAdmin = vIsSuper || !!otherRoles?.some((r) => r.role === "admin");
          vIsFinance = !!other.email && FINANCE_EMAILS.includes(other.email.toLowerCase());
        }
      }

      return {
        id: user.id,
        realId: user.id,
        email: vEmail,
        fullName: vName,
        isAdmin: vIsAdmin,
        isSuperAdmin: vIsSuper,
        isFinanceAdmin: vIsFinance,
        mustChangePassword: !!(profile as { must_change_password?: boolean } | null)?.must_change_password,
        viewingAs,
        realIsSuperAdmin: isSuperAdmin,
      };
    },
  });
}
