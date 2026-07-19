-- Approval workflow for task_activity hours
ALTER TABLE public.task_activity
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejected_reason text NULL,
  ADD COLUMN IF NOT EXISTS attendance_log_id uuid NULL,
  ADD COLUMN IF NOT EXISTS completion_date date NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_activity_approval_status_check'
  ) THEN
    ALTER TABLE public.task_activity
      ADD CONSTRAINT task_activity_approval_status_check
      CHECK (approval_status IN ('auto','pending','approved','rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_activity_pending
  ON public.task_activity(task_id) WHERE approval_status = 'pending';

-- Allow the task creator to update approval fields on their tasks
DROP POLICY IF EXISTS "creator can approve task hours" ON public.task_activity;
CREATE POLICY "creator can approve task hours"
  ON public.task_activity
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_activity.task_id
        AND t.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_activity.task_id
        AND t.created_by = auth.uid()
    )
  );
