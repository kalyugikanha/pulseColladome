## Fix: Reference links vanish on tasks (and don't carry between workflow stages)

**Root cause:** In `src/components/tasks/task-detail-sheet.tsx` (line 168) the "Add reference" button calls `supabase.from("tasks").update({ asset_links })` directly from the browser. The `tasks` table UPDATE policies only allow assignee, reviewer, project manager, department head, reporting manager, or admin to update. For anyone else (task creator/watcher, and often the workflow starter looking at a later stage where they're not assignee) the update is silently blocked by RLS — it returns no error and 0 rows changed, so the toast shows success but the row is unchanged. On refresh the link is "gone".

This also explains the "not carrying between stages" symptom: `spawnNextStage` does copy `asset_links` forward, but if the user who added the link couldn't actually persist it in the first place, there is nothing to carry.

**Fix — single new server function + one wiring change; no schema/RLS changes.**

1. **New server function `updateTaskAssetLinks` in `src/lib/tasks-workflow.functions.ts`:**
   - Middleware: `impersonationMiddleware` (already used across this file — gives us an authenticated supabase client + acting user).
   - Input: `{ taskId: string; links: { label: string; url: string }[] }`.
   - Authorize via existing `public.can_view_task(_task_id)` RPC using the RLS-scoped `context.supabase`. If it returns false → throw "You can't edit this task."
   - Persist with the admin client (loaded via `await import("@/integrations/supabase/client.server")` inside the handler, per project rules) so any authorized viewer can save references regardless of table-level UPDATE RLS.
   - Log a `references_updated` (or reuse `attachment_added`-style) entry in `task_activity` for auditability.

2. **`src/components/tasks/task-detail-sheet.tsx`:**
   - Replace the direct `supabase.from("tasks").update(...)` in `saveAssetLinks` with a `useServerFn(updateTaskAssetLinks)` call.
   - After success, invalidate the `["task-detail", taskId]` query (existing `refresh()`).

3. **No changes to workflow stage spawning** — `spawnNextStage` already carries `task.asset_links ?? []` forward. Once the save actually persists, links will correctly follow the task through stages.

4. **Sanity note (not code):** Attachments already work because that flow always uses a server function with admin client — mirror that pattern for links. No RLS widening is needed and no `tasks` UPDATE policy needs a new rule.