
-- Business Development module

CREATE TYPE public.bd_frequency AS ENUM ('daily','weekly');
CREATE TYPE public.bd_log_status AS ENUM ('pending','done','carried_forward');

-- Activity types (lookup)
CREATE TABLE public.bd_activity_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bd_activity_types TO authenticated;
GRANT ALL ON public.bd_activity_types TO service_role;
ALTER TABLE public.bd_activity_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bd_types read all authenticated" ON public.bd_activity_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "bd_types admin write" ON public.bd_activity_types FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()));

-- Recurring items
CREATE TABLE public.bd_recurring_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  assignee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_type_id uuid NOT NULL REFERENCES public.bd_activity_types(id) ON DELETE RESTRICT,
  frequency public.bd_frequency NOT NULL DEFAULT 'daily',
  weekdays int[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bd_recurring_assignee_idx ON public.bd_recurring_items(assignee_id) WHERE is_active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bd_recurring_items TO authenticated;
GRANT ALL ON public.bd_recurring_items TO service_role;
ALTER TABLE public.bd_recurring_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bd_recurring assignee read" ON public.bd_recurring_items FOR SELECT TO authenticated
  USING (assignee_id = auth.uid() OR private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()));
CREATE POLICY "bd_recurring admin write" ON public.bd_recurring_items FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()));

-- Activity logs
CREATE TABLE public.bd_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_type_id uuid NOT NULL REFERENCES public.bd_activity_types(id) ON DELETE RESTRICT,
  recurring_item_id uuid REFERENCES public.bd_recurring_items(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  hours_spent numeric(5,2),
  status public.bd_log_status NOT NULL DEFAULT 'pending',
  carried_forward_to date,
  media_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bd_logs_unique_recurring ON public.bd_activity_logs(user_id, log_date, recurring_item_id) WHERE recurring_item_id IS NOT NULL;
CREATE INDEX bd_logs_user_date_idx ON public.bd_activity_logs(user_id, log_date);
CREATE INDEX bd_logs_date_idx ON public.bd_activity_logs(log_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bd_activity_logs TO authenticated;
GRANT ALL ON public.bd_activity_logs TO service_role;
ALTER TABLE public.bd_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bd_logs owner read" ON public.bd_activity_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()));
CREATE POLICY "bd_logs owner insert" ON public.bd_activity_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()));
CREATE POLICY "bd_logs owner update" ON public.bd_activity_logs FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()));
CREATE POLICY "bd_logs owner delete" ON public.bd_activity_logs FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()));

-- updated_at triggers
CREATE TRIGGER bd_types_updated BEFORE UPDATE ON public.bd_activity_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bd_recurring_updated BEFORE UPDATE ON public.bd_recurring_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bd_logs_updated BEFORE UPDATE ON public.bd_activity_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed activity types
INSERT INTO public.bd_activity_types(name, sort_order) VALUES
  ('Inbound Follow-up', 10),
  ('CRM Update', 20),
  ('Client Call', 30),
  ('Client Meeting', 40),
  ('Outreach / Prospecting', 50),
  ('Tool / Account Setup', 60),
  ('Tracker / Admin', 70),
  ('Other', 80);

-- Storage policies for bd-activity-proof (private bucket)
CREATE POLICY "bd proof owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bd-activity-proof' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid())
  ));
CREATE POLICY "bd proof owner write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bd-activity-proof' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "bd proof owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'bd-activity-proof' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "bd proof owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bd-activity-proof' AND (storage.foldername(name))[1] = auth.uid()::text);
