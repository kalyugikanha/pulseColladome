import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
};

export function useCurrentUser() {
  return useQuery<CurrentUser | null>({
    queryKey: ["current-user"],
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
      return {
        id: user.id,
        email: profile?.email ?? user.email ?? null,
        fullName: profile?.full_name ?? null,
        isAdmin: isSuperAdmin || !!roles?.some((r) => r.role === "admin"),
        isSuperAdmin,
        mustChangePassword: !!(profile as { must_change_password?: boolean } | null)?.must_change_password,
      };
    },
  });
}
