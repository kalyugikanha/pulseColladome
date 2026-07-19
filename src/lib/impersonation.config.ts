/**
 * Feature flag for the super-admin impersonation attribution path.
 *
 * When true, any write server function that carries the
 * `impersonationMiddleware` will attribute the write to the impersonated
 * user (created_by / actor_id / etc.) and log a row into
 * `impersonation_audit` for backend traceability.
 *
 * When false, all impersonation helpers become no-ops and behavior is
 * identical to a non-impersonation build. This is the single kill switch
 * for the whole feature — flip to false to disable end-to-end.
 */
export const IMPERSONATION_ATTRIBUTION_ENABLED = true;

/** Same localStorage key that `useViewAs` writes into. */
export const IMPERSONATION_LOCAL_STORAGE_KEY = "colladome:viewAsUserId";

/** Header used to pass the impersonated user id from the client middleware to the server. */
export const IMPERSONATION_HEADER = "x-impersonate-user-id";
