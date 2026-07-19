/**
 * Server-only helpers for the super-admin impersonation attribution path.
 * Loaded lazily from the middleware so this module is never bundled to the
 * client. Deleting this file (plus impersonation.middleware.ts) removes the
 * entire feature.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function isSuperAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function profileExists(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  return !!data;
}

export async function recordImpersonationAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  realUserId: string,
  actingUserId: string,
  functionName: string | null,
): Promise<void> {
  // Best-effort — never block the actual mutation on audit failure.
  try {
    await supabase.from("impersonation_audit").insert({
      real_user_id: realUserId,
      acting_user_id: actingUserId,
      function_name: functionName,
    });
  } catch {
    /* swallow */
  }
}
