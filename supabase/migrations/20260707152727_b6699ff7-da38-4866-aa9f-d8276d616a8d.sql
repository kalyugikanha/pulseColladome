-- Allow a person's reporting manager to approve/reject their task-hour logs.
DROP POLICY IF EXISTS "reporting manager can approve task hours" ON public.task_activity;
CREATE POLICY "reporting manager can approve task hours"
  ON public.task_activity
  FOR UPDATE
  TO authenticated
  USING (
    private.is_reporting_manager_of(auth.uid(), task_activity.actor_id)
    OR private.is_super_admin(auth.uid())
  )
  WITH CHECK (
    private.is_reporting_manager_of(auth.uid(), task_activity.actor_id)
    OR private.is_super_admin(auth.uid())
  );