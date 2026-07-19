CREATE OR REPLACE FUNCTION private.can_view_task(_task_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND (
        private.can_manage_projects(_user_id)
        OR private.is_admin(_user_id)
        OR private.is_hr_admin(_user_id)
        OR private.is_super_admin(_user_id)
        OR t.assignee_id = _user_id
        OR t.reviewer_id = _user_id
        OR t.created_by = _user_id
        OR (t.assignee_id IS NOT NULL AND private.is_reporting_manager_of(_user_id, t.assignee_id))
        OR (t.assignee_id IS NOT NULL AND private.is_head_of_user(_user_id, t.assignee_id))
        OR EXISTS (SELECT 1 FROM public.task_watchers w WHERE w.task_id = t.id AND w.user_id = _user_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_task_taxonomy(_task_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = _task_id
      AND (
        private.can_manage_projects(_user_id)
        OR private.is_admin(_user_id)
        OR private.is_hr_admin(_user_id)
        OR private.is_super_admin(_user_id)
        OR t.assignee_id = _user_id
        OR t.created_by = _user_id
        OR (t.assignee_id IS NOT NULL AND private.is_reporting_manager_of(_user_id, t.assignee_id))
        OR (t.assignee_id IS NOT NULL AND private.is_head_of_user(_user_id, t.assignee_id))
      )
  );
$$;

DROP POLICY IF EXISTS "ttt: read via task" ON public.task_task_types;
DROP POLICY IF EXISTS "ttt: write via task" ON public.task_task_types;
CREATE POLICY "ttt: read via task"
ON public.task_task_types
FOR SELECT
TO authenticated
USING (private.can_view_task(task_id, auth.uid()));
CREATE POLICY "ttt: write via task"
ON public.task_task_types
FOR ALL
TO authenticated
USING (private.can_manage_task_taxonomy(task_id, auth.uid()))
WITH CHECK (private.can_manage_task_taxonomy(task_id, auth.uid()));

DROP POLICY IF EXISTS "watchers: read" ON public.task_watchers;
DROP POLICY IF EXISTS "watchers: self write" ON public.task_watchers;
CREATE POLICY "watchers: read" ON public.task_watchers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.can_view_task(task_id, auth.uid()));
CREATE POLICY "watchers: self write" ON public.task_watchers FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND private.can_view_task(task_id, auth.uid()));

DROP POLICY IF EXISTS "activity: read via task" ON public.task_activity;
DROP POLICY IF EXISTS "activity: insert via task" ON public.task_activity;
CREATE POLICY "activity: read via task" ON public.task_activity FOR SELECT TO authenticated
  USING (private.can_view_task(task_id, auth.uid()));
CREATE POLICY "activity: insert via task" ON public.task_activity FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND private.can_view_task(task_id, auth.uid()));

DROP POLICY IF EXISTS "comments: read via task" ON public.task_comments;
DROP POLICY IF EXISTS "comments: insert via task" ON public.task_comments;
DROP POLICY IF EXISTS "comments: author update or visible" ON public.task_comments;
CREATE POLICY "comments: read via task" ON public.task_comments FOR SELECT TO authenticated
  USING (private.can_view_task(task_id, auth.uid()));
CREATE POLICY "comments: insert via task" ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND private.can_view_task(task_id, auth.uid()));
CREATE POLICY "comments: author update or visible" ON public.task_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR private.can_view_task(task_id, auth.uid()))
  WITH CHECK (private.can_view_task(task_id, auth.uid()));

DROP POLICY IF EXISTS "attachments: read via comment" ON public.task_comment_attachments;
CREATE POLICY "attachments: read via comment" ON public.task_comment_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.task_comments c WHERE c.id = comment_id AND private.can_view_task(c.task_id, auth.uid())));

DROP POLICY IF EXISTS "mentions: read mentioned or visible" ON public.task_mentions;
CREATE POLICY "mentions: read mentioned or visible" ON public.task_mentions FOR SELECT TO authenticated
  USING (mentioned_user_id = auth.uid() OR private.can_view_task(task_id, auth.uid()));

DROP POLICY IF EXISTS "subtasks: read via task" ON public.task_subtasks;
DROP POLICY IF EXISTS "subtasks: write via task" ON public.task_subtasks;
CREATE POLICY "subtasks: read via task" ON public.task_subtasks FOR SELECT TO authenticated
  USING (private.can_view_task(task_id, auth.uid()));
CREATE POLICY "subtasks: write via task" ON public.task_subtasks FOR ALL TO authenticated
  USING (private.can_view_task(task_id, auth.uid())) WITH CHECK (private.can_view_task(task_id, auth.uid()));

DROP POLICY IF EXISTS "deps: read visible" ON public.task_dependencies;
DROP POLICY IF EXISTS "deps: write visible" ON public.task_dependencies;
CREATE POLICY "deps: read visible" ON public.task_dependencies FOR SELECT TO authenticated
  USING (private.can_view_task(task_id, auth.uid()) OR private.can_view_task(depends_on_task_id, auth.uid()));
CREATE POLICY "deps: write visible" ON public.task_dependencies FOR ALL TO authenticated
  USING (private.can_view_task(task_id, auth.uid())) WITH CHECK (private.can_view_task(task_id, auth.uid()));

DROP POLICY IF EXISTS "notif: insert task-visible" ON public.notifications;
CREATE POLICY "notif: insert task-visible" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (task_id IS NOT NULL AND private.can_view_task(task_id, auth.uid()));

DROP FUNCTION IF EXISTS public.can_manage_task_taxonomy(uuid, uuid);
REVOKE ALL ON FUNCTION public.can_view_task(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_task(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_view_task(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.can_view_task(uuid) FROM service_role;