
CREATE TABLE public.google_calendar_tokens (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.google_calendar_tokens TO authenticated;
GRANT ALL ON public.google_calendar_tokens TO service_role;

ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own google tokens"
  ON public.google_calendar_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Super admins can view all google tokens"
  ON public.google_calendar_tokens FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER google_calendar_tokens_set_updated_at
  BEFORE UPDATE ON public.google_calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
