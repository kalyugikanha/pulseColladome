CREATE POLICY "Assignees can view standup flags on their tasks"
  ON public.standup_flags
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = standup_flags.task_id AND t.assignee_id = auth.uid()
    )
  );