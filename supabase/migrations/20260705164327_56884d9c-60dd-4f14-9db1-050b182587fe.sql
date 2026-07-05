CREATE TABLE public.assistant_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.assistant_messages TO authenticated;
GRANT ALL ON public.assistant_messages TO service_role;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assistant_messages: own read" ON public.assistant_messages FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "assistant_messages: own insert" ON public.assistant_messages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "assistant_messages: own delete" ON public.assistant_messages FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX assistant_messages_user_created_idx ON public.assistant_messages (user_id, created_at);