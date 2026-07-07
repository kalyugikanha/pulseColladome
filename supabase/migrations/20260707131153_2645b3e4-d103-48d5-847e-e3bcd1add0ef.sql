
DROP POLICY IF EXISTS "activity: insert self" ON public.task_activity;
DROP POLICY IF EXISTS "activity: insert via task" ON public.task_activity;

CREATE POLICY "activity: insert self or impersonated" ON public.task_activity
FOR INSERT TO authenticated
WITH CHECK (
  (actor_id = auth.uid() OR EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()))
  AND public.can_view_task(task_id)
);
