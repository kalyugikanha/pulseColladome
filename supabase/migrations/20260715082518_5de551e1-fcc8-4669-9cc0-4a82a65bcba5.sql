
CREATE TABLE public.standup_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  flagged_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX standup_flags_flagged_by_active_idx
  ON public.standup_flags (flagged_by, created_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX standup_flags_task_idx ON public.standup_flags (task_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.standup_flags TO authenticated;
GRANT ALL ON public.standup_flags TO service_role;

ALTER TABLE public.standup_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own standup flags"
  ON public.standup_flags
  FOR ALL
  TO authenticated
  USING (auth.uid() = flagged_by)
  WITH CHECK (auth.uid() = flagged_by);
