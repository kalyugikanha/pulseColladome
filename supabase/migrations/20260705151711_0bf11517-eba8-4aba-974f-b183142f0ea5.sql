
ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Employees can only edit their own logs when the day is not approved.
DROP POLICY IF EXISTS "attendance: own update" ON public.attendance_logs;
CREATE POLICY "attendance: own update"
  ON public.attendance_logs FOR UPDATE
  USING (auth.uid() = user_id AND approved_at IS NULL)
  WITH CHECK (auth.uid() = user_id AND approved_at IS NULL);
