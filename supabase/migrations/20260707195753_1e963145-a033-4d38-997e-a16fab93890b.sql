DROP POLICY IF EXISTS "Authorised raters can rate a task" ON public.task_ratings;
DROP POLICY IF EXISTS "Raters can update own rating" ON public.task_ratings;
DROP POLICY IF EXISTS "Raters can delete own rating" ON public.task_ratings;

CREATE POLICY "Authorised raters can rate a task"
ON public.task_ratings
FOR INSERT
TO authenticated
WITH CHECK (
  rater_id <> ratee_id
  AND (
    rater_id = auth.uid()
    OR private.is_super_admin(auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public.tasks t
    LEFT JOIN public.profiles p ON p.id = t.assignee_id
    WHERE t.id = task_ratings.task_id
      AND t.assignee_id = task_ratings.ratee_id
      AND (
        t.reviewer_id = task_ratings.rater_id
        OR t.created_by = task_ratings.rater_id
        OR p.reporting_manager_id = task_ratings.rater_id
      )
  )
);

CREATE POLICY "Raters can update own rating"
ON public.task_ratings
FOR UPDATE
TO authenticated
USING (
  rater_id = auth.uid()
  OR private.is_super_admin(auth.uid())
)
WITH CHECK (
  rater_id <> ratee_id
  AND (
    rater_id = auth.uid()
    OR private.is_super_admin(auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public.tasks t
    LEFT JOIN public.profiles p ON p.id = t.assignee_id
    WHERE t.id = task_ratings.task_id
      AND t.assignee_id = task_ratings.ratee_id
      AND (
        t.reviewer_id = task_ratings.rater_id
        OR t.created_by = task_ratings.rater_id
        OR p.reporting_manager_id = task_ratings.rater_id
      )
  )
);

CREATE POLICY "Raters can delete own rating"
ON public.task_ratings
FOR DELETE
TO authenticated
USING (
  rater_id = auth.uid()
  OR private.is_super_admin(auth.uid())
);