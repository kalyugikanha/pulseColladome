ALTER TABLE public.workflow_template_stages
  ADD COLUMN IF NOT EXISTS default_reviewer_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL;