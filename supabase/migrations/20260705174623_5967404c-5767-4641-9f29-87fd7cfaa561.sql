ALTER TABLE public.google_calendar_tokens
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_error TEXT;

CREATE TABLE public.google_calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  google_event_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  description_snippet TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT false,
  location TEXT,
  meeting_link TEXT,
  organizer_email TEXT,
  attendees_count INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  html_link TEXT,
  is_private BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, calendar_id, google_event_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_calendar_events TO authenticated;
GRANT ALL ON public.google_calendar_events TO service_role;

ALTER TABLE public.google_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar events are visible to signed in users"
  ON public.google_calendar_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "users manage their own calendar events"
  ON public.google_calendar_events FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER google_calendar_events_set_updated_at
  BEFORE UPDATE ON public.google_calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX google_calendar_events_time_idx ON public.google_calendar_events (start_at, end_at);
CREATE INDEX google_calendar_events_user_time_idx ON public.google_calendar_events (user_id, start_at, end_at);

CREATE TABLE public.team_calendar_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  google_event_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  meeting_link TEXT,
  attendee_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'created',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_calendar_bookings TO authenticated;
GRANT ALL ON public.team_calendar_bookings TO service_role;

ALTER TABLE public.team_calendar_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team bookings are visible to signed in users"
  ON public.team_calendar_bookings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "users create their own team bookings"
  ON public.team_calendar_bookings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "users update their own team bookings"
  ON public.team_calendar_bookings FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "users delete their own team bookings"
  ON public.team_calendar_bookings FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE TRIGGER team_calendar_bookings_set_updated_at
  BEFORE UPDATE ON public.team_calendar_bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX team_calendar_bookings_time_idx ON public.team_calendar_bookings (start_at, end_at);
CREATE INDEX team_calendar_bookings_creator_time_idx ON public.team_calendar_bookings (created_by, start_at, end_at);