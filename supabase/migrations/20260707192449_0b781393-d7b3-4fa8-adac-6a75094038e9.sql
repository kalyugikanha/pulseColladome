
DROP POLICY IF EXISTS "Reviewer can rate a task" ON public.task_ratings;

CREATE POLICY "Reviewer can rate a task"
ON public.task_ratings
FOR INSERT
TO authenticated
WITH CHECK (
  rater_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_ratings.task_id
      AND t.assignee_id = task_ratings.ratee_id
      AND (
        t.reviewer_id = auth.uid()
        OR (t.reviewer_id IS NULL AND t.created_by = auth.uid())
      )
  )
);
