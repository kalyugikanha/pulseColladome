import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AuthedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  actingUserId: string; // honors view-as impersonation for super admins
  isSuperAdmin: boolean;
};

export async function authorizeRequest(request: Request): Promise<AuthedContext> {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authHeader.slice(7);
  if (!token || token.split(".").length !== 3) throw new Error("Unauthorized");

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new Error("Unauthorized");
  const userId = data.claims.sub as string;

  const { data: sa } = await supabase.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle();
  const isSuperAdmin = !!sa;

  const viewAs = request.headers.get("x-view-as-user")?.trim() || null;
  const actingUserId = isSuperAdmin && viewAs ? viewAs : userId;

  return { supabase, userId, actingUserId, isSuperAdmin };
}
