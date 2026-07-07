/**
 * Impersonation middleware — layered on top of requireSupabaseAuth.
 *
 * When a super admin has the "View as" picker set to someone else, the
 * client half of this middleware ships the target user id to the server
 * via `sendContext`. The server half verifies the caller really is a
 * super admin, the target profile exists, and then augments the request
 * context with:
 *
 *   context.actingUserId   — the id to use for created_by / actor_id / etc.
 *   context.impersonatedBy — the real super-admin id when impersonating, else null
 *   context.isImpersonating — boolean
 *
 * When not impersonating (or when the feature flag is off) these fields
 * mirror context.userId and no audit row is written.
 *
 * Handlers opt in by attaching this middleware AFTER requireSupabaseAuth
 * and by using `context.actingUserId` for any INSERT/UPDATE actor column.
 */

import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  IMPERSONATION_ATTRIBUTION_ENABLED,
  IMPERSONATION_LOCAL_STORAGE_KEY,
} from "./impersonation.config";

export const impersonationMiddleware = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .client(async ({ next }) => {
    let viewAsUserId: string | null = null;
    if (IMPERSONATION_ATTRIBUTION_ENABLED && typeof window !== "undefined") {
      try {
        viewAsUserId = window.localStorage.getItem(IMPERSONATION_LOCAL_STORAGE_KEY);
      } catch {
        viewAsUserId = null;
      }
    }
    return next({ sendContext: { viewAsUserId } });
  })
  .server(async ({ next, context }) => {
    const realUserId = context.userId;
    const supabase = context.supabase;

    // Feature flag off, or no impersonation target sent → passthrough.
    const raw = (context as unknown as { viewAsUserId?: string | null }).viewAsUserId;
    const viewAsUserId = typeof raw === "string" && raw.length > 0 ? raw : null;

    if (!IMPERSONATION_ATTRIBUTION_ENABLED || !viewAsUserId || viewAsUserId === realUserId) {
      return next({
        context: {
          actingUserId: realUserId,
          impersonatedBy: null as string | null,
          isImpersonating: false,
        },
      });
    }

    // Lazy-load server-only helpers so this module can also be safely
    // imported from client entry points.
    const { isSuperAdmin, profileExists, recordImpersonationAudit } = await import(
      "./impersonation.server"
    );

    const [callerIsSuper, targetExists] = await Promise.all([
      isSuperAdmin(supabase, realUserId),
      profileExists(supabase, viewAsUserId),
    ]);

    if (!callerIsSuper || !targetExists) {
      // Not authorized to impersonate — fall back to real identity silently.
      return next({
        context: {
          actingUserId: realUserId,
          impersonatedBy: null as string | null,
          isImpersonating: false,
        },
      });
    }

    // Best-effort audit row. Does not block the handler on failure.
    let functionName: string | null = null;
    try {
      const req = (context as unknown as { request?: Request }).request;
      if (req) {
        const u = new URL(req.url);
        functionName = u.searchParams.get("_serverFnId") ?? u.pathname;
      }
    } catch {
      /* ignore */
    }
    await recordImpersonationAudit(supabase, realUserId, viewAsUserId, functionName);

    return next({
      context: {
        actingUserId: viewAsUserId,
        impersonatedBy: realUserId as string | null,
        isImpersonating: true,
      },
    });
  });
