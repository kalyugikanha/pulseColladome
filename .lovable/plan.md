## 1. Fix the "View as" picker (show every employee)

`TopBar` calls `supabase.from("profiles").select(...)` from the browser. That read is filtered by the profiles-table RLS, so a super admin only sees the subset RLS lets through (own team, department, etc.) — that's the "partial list".

Fix:
- Add a SECURITY DEFINER RPC `public.list_all_profiles_for_super_admin()` that:
  - returns `id, full_name, email, department, is_active` for **every** profile
  - first checks `EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())` and raises `insufficient_privilege` otherwise
- `TopBar` swaps its query to `supabase.rpc("list_all_profiles_for_super_admin")`.
- Also filter `is_active = true` and exclude placeholders in the picker.

No RLS changes on `profiles` itself.

## 2. Impersonation write-attribution — single isolated code path

Everything below lives in one new module `src/lib/impersonation.server.ts` and one middleware, so it can be stripped by deleting one file + one middleware entry.

### 2a. Feature flag
`src/lib/impersonation.config.ts` exports:
```ts
export const IMPERSONATION_ATTRIBUTION_ENABLED = true;
```
When `false`, every helper below is a no-op and behavior reverts to today (super admin's own id is used).

### 2b. Server middleware `impersonationMiddleware`
- Attached alongside `requireSupabaseAuth` on every write server function.
- Client side: reads `viewAsUserId` from `localStorage` (same key `use-view-as` uses) and sends it via `sendContext`.
- Server side:
  1. If flag off → set `context.actingUserId = context.userId`, `context.isImpersonating = false`, done.
  2. Else verify caller is in `super_admins` and the target profile exists → set `actingUserId = viewAsUserId`, `isImpersonating = true`.
  3. Otherwise fall back to real user id (defensive).

Handlers read `context.actingUserId` instead of `context.userId` for `created_by / actor_id / user_id / author_id` on any INSERT/UPDATE. Existing `resolveActingUser` helpers in `tasks-workflow.functions.ts` and `workflows.functions.ts` are replaced with `context.actingUserId` (thin swap, ~1 line per call site).

### 2c. Hidden audit marker
Two-layer, so nothing user-facing ever renders it:

1. **Central audit table** (source of truth):
   `impersonation_audit(id, real_user_id, acting_user_id, table_name, record_id, action, created_at)`.
   RLS: only super admins can `SELECT`; no `TO anon`/`authenticated` read grant. `service_role` full access.
   The middleware writes one row per mutation (table + row id + action).

2. **Nullable `impersonated_by uuid` column** on the write-target tables:
   `tasks`, `task_comments`, `task_activity`, `task_subtasks`, `task_watchers`, `task_ratings`, `task_review_comments`, `punch_sessions`, `attendance_logs`.
   Populated only when `isImpersonating = true`. Never SELECTed by any UI query. Not added to any list / detail / activity / timesheet component. RLS unchanged (column just piggybacks on existing row policies).

Both are internal-only. No UI badge, no activity-feed entry, no filter.

### 2d. Writes covered
All existing write server functions in:
- `src/lib/tasks-workflow.functions.ts` (status change, review approve/reject, ratings, reviewer, subtasks, watchers, comments, asset links)
- `src/lib/workflows.functions.ts` (stage transitions, hours logging)
- `src/lib/tasks-plus.functions.ts` (task create/edit, dependencies)
- `src/lib/assistant/apply.functions.ts` (assistant applies)

Each already accepts `viewAsUserId` in its validator — those become redundant and are removed; `context.actingUserId` is the single source. Client call sites drop the `viewAsUserId` arg.

## 3. Not-impersonating behavior

When `viewAsUserId` is null OR caller isn't a super admin:
- `actingUserId === userId` (identical to today)
- `impersonated_by` stays NULL
- No `impersonation_audit` row is written
- The picker RPC is only used when the super admin opens the picker; regular users never call it

Everything else — RLS, dashboards, notifications, timesheets — is untouched.

## Technical section

### Files added
- `supabase migration` — RPC, `impersonation_audit` table + grants + RLS, `impersonated_by` columns
- `src/lib/impersonation.config.ts`
- `src/lib/impersonation.server.ts` (helpers: `assertSuperAdmin`, `recordImpersonationAudit`)
- `src/lib/impersonation.middleware.ts` (the server-fn middleware)

### Files edited (thin swaps only)
- `src/components/top-bar.tsx` — switch to RPC
- `src/lib/tasks-workflow.functions.ts`, `src/lib/workflows.functions.ts`, `src/lib/tasks-plus.functions.ts`, `src/lib/assistant/apply.functions.ts` — attach middleware, replace `resolveActingUser(...)` with `context.actingUserId`, drop `viewAsUserId` input field
- Call sites that pass `viewAsUserId` → remove the arg

### Stripping later
Delete `impersonation.*` files, remove middleware from server-fn chains, drop `impersonated_by` columns and `impersonation_audit` table. No core write logic changes required.

### Out of scope
- No changes to `useCurrentUser` (still returns impersonated view for UI)
- No changes to RLS policies on task/comment/etc. tables
- No changes to notifications targeting or dashboards

## One confirmation before I build

**Where should the hidden marker live?**
- (A) Central `impersonation_audit` table **only** — cleanest to strip, one place to query for audit.
- (B) Central table **plus** `impersonated_by` column on each write-target table — richer per-row traceability, more schema surface to remove later.

Plan above assumes **B**. Reply "A" to drop the per-table columns.