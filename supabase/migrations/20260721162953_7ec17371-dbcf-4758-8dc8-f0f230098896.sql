
CREATE TABLE public.standup_settings (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  meeting_link text,
  start_time time NOT NULL DEFAULT '11:00:00',
  end_time time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT standup_settings_start_time_min CHECK (start_time >= '11:00:00'::time),
  CONSTRAINT standup_settings_end_after_start CHECK (end_time IS NULL OR end_time > start_time)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.standup_settings TO authenticated;
GRANT ALL ON public.standup_settings TO service_role;

ALTER TABLE public.standup_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view standup settings"
  ON public.standup_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users manage own standup settings"
  ON public.standup_settings FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id
    OR private.is_admin(auth.uid())
    OR private.is_super_admin(auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    OR private.is_admin(auth.uid())
    OR private.is_super_admin(auth.uid())
  );

CREATE TRIGGER trg_standup_settings_updated_at
  BEFORE UPDATE ON public.standup_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
