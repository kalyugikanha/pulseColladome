
DROP POLICY IF EXISTS "calendar events are visible to signed in users" ON public.google_calendar_events;

CREATE POLICY "calendar events: owner read"
ON public.google_calendar_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "team bookings are visible to signed in users" ON public.team_calendar_bookings;

CREATE POLICY "team bookings: creator read"
ON public.team_calendar_bookings
FOR SELECT
TO authenticated
USING (auth.uid() = created_by);

CREATE POLICY "team bookings: attendee read"
ON public.team_calendar_bookings
FOR SELECT
TO authenticated
USING (
  attendee_emails ? lower((auth.jwt() ->> 'email'))
  OR attendee_emails ? (auth.jwt() ->> 'email')
);
