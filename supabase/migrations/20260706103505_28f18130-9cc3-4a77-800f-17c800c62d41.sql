DROP POLICY IF EXISTS "notif: insert any auth" ON public.notifications;
CREATE POLICY "notif: insert task-visible" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (task_id IS NOT NULL AND public.can_view_task(task_id));