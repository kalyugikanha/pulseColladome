
DROP POLICY IF EXISTS "trc_insert_if_can_view_task" ON public.task_review_comments;

CREATE POLICY "trc_insert_if_can_view_task" ON public.task_review_comments
FOR INSERT TO authenticated
WITH CHECK (
  (author_id = auth.uid() OR EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()))
  AND public.can_view_task(task_id)
);
