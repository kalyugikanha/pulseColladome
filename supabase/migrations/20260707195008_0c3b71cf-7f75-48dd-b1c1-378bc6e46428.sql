DROP POLICY IF EXISTS "Reviewer can rate a task" ON public.task_ratings;

CREATE POLICY "Authorised raters can rate a task"
  ON public.task_ratings FOR INSERT TO authenticated
  WITH CHECK (
    rater_id = auth.uid()
    AND rater_id <> ratee_id
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      LEFT JOIN public.profiles p ON p.id = t.assignee_id
      WHERE t.id = task_ratings.task_id
        AND t.assignee_id = task_ratings.ratee_id
        AND (
          t.reviewer_id = auth.uid()
          OR t.created_by = auth.uid()
          OR p.reporting_manager_id = auth.uid()
        )
    )
  );

CREATE POLICY "Rater can view own ratings"
  ON public.task_ratings FOR SELECT TO authenticated
  USING (rater_id = auth.uid());

CREATE POLICY "Raters can update own rating"
  ON public.task_ratings FOR UPDATE TO authenticated
  USING (rater_id = auth.uid()) WITH CHECK (rater_id = auth.uid());

CREATE POLICY "Raters can delete own rating"
  ON public.task_ratings FOR DELETE TO authenticated
  USING (rater_id = auth.uid());