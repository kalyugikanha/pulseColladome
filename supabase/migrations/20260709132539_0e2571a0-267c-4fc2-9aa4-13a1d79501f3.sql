
ALTER TABLE public.punch_sessions
  ADD COLUMN IF NOT EXISTS on_behalf_of uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS punch_sessions_on_behalf_of_idx
  ON public.punch_sessions(on_behalf_of)
  WHERE on_behalf_of IS NOT NULL;

COMMENT ON COLUMN public.punch_sessions.on_behalf_of IS
  'When non-null, holds the real admin id who logged this session via View-As impersonation. NULL when the employee (user_id) logged it themselves.';
