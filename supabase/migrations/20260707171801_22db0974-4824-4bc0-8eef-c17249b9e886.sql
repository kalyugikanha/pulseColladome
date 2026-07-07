
CREATE TABLE public.task_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  ratee_id uuid NOT NULL,
  rater_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_ratings_ratee_created_idx ON public.task_ratings (ratee_id, created_at DESC);
CREATE INDEX task_ratings_task_idx ON public.task_ratings (task_id);

GRANT SELECT, INSERT ON public.task_ratings TO authenticated;
GRANT ALL ON public.task_ratings TO service_role;

ALTER TABLE public.task_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviewer can rate a task"
  ON public.task_ratings FOR INSERT TO authenticated
  WITH CHECK (
    rater_id = auth.uid()
    AND ratee_id <> auth.uid()
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

CREATE POLICY "Ratee can view own ratings"
  ON public.task_ratings FOR SELECT TO authenticated
  USING (ratee_id = auth.uid());

CREATE POLICY "Super admins can view all ratings"
  ON public.task_ratings FOR SELECT TO authenticated
  USING (private.is_super_admin(auth.uid()));
