
-- Event status enum
DO $$ BEGIN
  CREATE TYPE public.event_status AS ENUM ('upcoming','ongoing','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Event source enum
DO $$ BEGIN
  CREATE TYPE public.event_source AS ENUM ('whatsapp','email','manual','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  location text,
  start_date date NOT NULL,
  end_date date,
  status public.event_status NOT NULL DEFAULT 'upcoming',
  source public.event_source NOT NULL DEFAULT 'manual',
  source_file_path text,
  source_text text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view events"
  ON public.events FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert events"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()));

CREATE POLICY "Admins can update events"
  ON public.events FOR UPDATE
  TO authenticated
  USING (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()));

CREATE POLICY "Admins can delete events"
  ON public.events FOR DELETE
  TO authenticated
  USING (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()));

CREATE TRIGGER events_set_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage policies for event-sources bucket
CREATE POLICY "Authenticated can read event source files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'event-sources');

CREATE POLICY "Admins can upload event source files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'event-sources' AND (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid())));

CREATE POLICY "Admins can update event source files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'event-sources' AND (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid())))
  WITH CHECK (bucket_id = 'event-sources' AND (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid())));

CREATE POLICY "Admins can delete event source files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'event-sources' AND (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid())));
