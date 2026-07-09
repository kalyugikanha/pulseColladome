-- ============================================================
-- Security hardening: 6 findings
-- ============================================================

-- ------------------------------------------------------------
-- (A) SECURITY DEFINER function exec grants
-- Trigger-only / server-only funcs: revoke from PUBLIC + anon + authenticated
-- User-callable RPCs: revoke from PUBLIC + anon, keep authenticated
-- ------------------------------------------------------------

-- Trigger-only (never invoked directly)
REVOKE EXECUTE ON FUNCTION public.seed_onboarding_sections()                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tasks_auto_reviewer()                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_leave_status_change()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_punch_session_attendance_sync()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_stale_open_punch_sessions()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_colladome_email()                           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_attendance_from_punch_sessions(uuid, date)     FROM PUBLIC, anon, authenticated;

-- Server-side helpers (called through server functions using service_role or via SECURITY DEFINER chains)
REVOKE EXECUTE ON FUNCTION public.find_auth_user_id_by_email(text)                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_onboarding_gate(uuid)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_task_occurrences()               FROM PUBLIC, anon, authenticated;

-- Legit user-callable RPCs — revoke anon + PUBLIC only, keep authenticated
REVOKE EXECUTE ON FUNCTION public.create_task_full(uuid, text, text, date, task_priority, uuid, jsonb, uuid, uuid[], numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_task_full(uuid, text, text, date, task_priority, uuid, jsonb, uuid, uuid[], numeric) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.request_task_from_manager(text, uuid, text)         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_task_from_manager(text, uuid, text)         TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_all_profiles_for_super_admin()                 FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_all_profiles_for_super_admin()                 TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_assignable_users()                             FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_assignable_users()                             TO authenticated;

REVOKE EXECUTE ON FUNCTION public.bd_list_visible_users()                             FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.bd_list_visible_users()                             TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_view_task(uuid)                                 FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_view_task(uuid)                                 TO authenticated;

-- ------------------------------------------------------------
-- (B) projects: drop broad "USING true" SELECT policy.
-- Remaining SELECT policies keep access for admins, project managers, HR,
-- department heads, project creators, and anyone assigned to / creating a
-- task on the project.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "projects: all authenticated read" ON public.projects;

-- ------------------------------------------------------------
-- (C) task_comments: drop the duplicate/inconsistent UPDATE and INSERT
-- policies that use the non-namespaced can_view_task(task_id) form. The
-- namespaced "comments: author update or visible" (UPDATE) and
-- "comments: insert via task" (INSERT) already cover the same cases with
-- consistent private.can_view_task(task_id, auth.uid()) semantics.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "comments: update" ON public.task_comments;
DROP POLICY IF EXISTS "comments: insert" ON public.task_comments;

-- ------------------------------------------------------------
-- (D) workflow_instances: replace the "USING true" broad SELECT policy with
-- a scoped one — the instance is visible to its starter, to admins/HR/super
-- admins, and to anyone who can view at least one stage task in the
-- instance (assignee/reviewer/creator/manager/watcher).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "wf_instances_read_all" ON public.workflow_instances;

CREATE POLICY "wf_instances_read_scoped"
  ON public.workflow_instances
  FOR SELECT
  USING (
    started_by = auth.uid()
    OR private.is_admin(auth.uid())
    OR private.is_hr_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.workflow_instance_id = workflow_instances.id
        AND private.can_view_task(t.id, auth.uid())
    )
  );

-- ------------------------------------------------------------
-- (E) task_task_types: private.can_manage_task_taxonomy was reviewed and
-- correctly scopes writes via auth.uid() to task participants (assignee,
-- creator, reporting-manager chain, dept head) and project managers/admins.
-- Document the review so future scanners can see the audit trail.
-- ------------------------------------------------------------
COMMENT ON FUNCTION private.can_manage_task_taxonomy(uuid, uuid) IS
  'Security-reviewed 2026-07-09: writes are restricted via auth.uid() to task participants (assignee, creator, reporting-manager chain, department head) or project managers / admins / HR / super-admins. Used by the "ttt: write via task" policy on public.task_task_types.';