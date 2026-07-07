
-- Marketing Kanban columns on tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS marketing_stage text,
  ADD COLUMN IF NOT EXISTS scheduled_post_date date,
  ADD COLUMN IF NOT EXISTS client_brand text,
  ADD COLUMN IF NOT EXISTS origin_department text,
  ADD COLUMN IF NOT EXISTS requester_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_marketing_stage_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_marketing_stage_check
  CHECK (marketing_stage IS NULL OR marketing_stage IN ('script_writing','script_wip','design','review','posting','posted'));

CREATE INDEX IF NOT EXISTS tasks_marketing_stage_idx ON public.tasks(marketing_stage) WHERE marketing_stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_requester_id_idx ON public.tasks(requester_id) WHERE requester_id IS NOT NULL;

-- Marketing clients / brands
CREATE TABLE IF NOT EXISTS public.marketing_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_clients TO authenticated;
GRANT ALL ON public.marketing_clients TO service_role;

ALTER TABLE public.marketing_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketing_clients read" ON public.marketing_clients;
CREATE POLICY "marketing_clients read" ON public.marketing_clients
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "marketing_clients admin write" ON public.marketing_clients;
CREATE POLICY "marketing_clients admin write" ON public.marketing_clients
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS marketing_clients_set_updated_at ON public.marketing_clients;
CREATE TRIGGER marketing_clients_set_updated_at BEFORE UPDATE ON public.marketing_clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.marketing_clients (name) VALUES
  ('Colladome'),('Oswal Soap Group'),('GrowInsight'),('NNIS Sports')
ON CONFLICT (name) DO NOTHING;
