ALTER TABLE public.workflow_template_stages
  ADD COLUMN IF NOT EXISTS use_post_date_as_deadline boolean NOT NULL DEFAULT false;