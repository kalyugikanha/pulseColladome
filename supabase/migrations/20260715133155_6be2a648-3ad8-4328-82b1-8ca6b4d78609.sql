
ALTER TABLE public.standup_flags ALTER COLUMN task_id DROP NOT NULL;
ALTER TABLE public.standup_flags ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.standup_flags ADD COLUMN IF NOT EXISTS assignee_tag uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.standup_flags DROP CONSTRAINT IF EXISTS standup_flags_task_or_title_check;
ALTER TABLE public.standup_flags ADD CONSTRAINT standup_flags_task_or_title_check CHECK (task_id IS NOT NULL OR title IS NOT NULL);

DROP POLICY IF EXISTS "Assignees can view standup flags on their tasks" ON public.standup_flags;
CREATE POLICY "Assignees and tagged users can view standup flags"
ON public.standup_flags
FOR SELECT
TO authenticated
USING (
  assignee_tag = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = standup_flags.task_id AND t.assignee_id = auth.uid()
  )
);
