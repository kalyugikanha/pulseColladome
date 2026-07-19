ALTER TABLE public.workflow_template_stages ADD COLUMN IF NOT EXISTS next_stage_position INTEGER NULL;

UPDATE public.workflow_template_stages s
SET next_stage_position = 4
FROM public.workflow_templates t
WHERE s.template_id = t.id
  AND t.name = 'Static Creation Workflow'
  AND s.position = 2;