
-- 1) Workflow template flag: is_content_workflow
ALTER TABLE public.workflow_templates
  ADD COLUMN IF NOT EXISTS is_content_workflow boolean NOT NULL DEFAULT false;

UPDATE public.workflow_templates
   SET is_content_workflow = true
 WHERE lower(name) IN (
   'ai in 60 reel',
   'colladome graphic creation workflow',
   'founders cut video production',
   'copy of founders cut video production',
   'growinsight graphics creation',
   'linkedin - shubham static creation workflow',
   'oswal graphics creation',
   'sufi workflow',
   'case study content website'
 );

-- 2) Platform taxonomy: add category column and seed platform values
ALTER TABLE public.taxonomy_task_types
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';

-- Seed platforms (department_id null, category='platform')
INSERT INTO public.taxonomy_task_types (name, department_id, category, active, is_custom)
SELECT v.name, NULL::uuid, 'platform', true, false
  FROM (VALUES
    ('Instagram'),
    ('LinkedIn'),
    ('Facebook'),
    ('X (Twitter)'),
    ('YouTube'),
    ('Website')
  ) AS v(name)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.taxonomy_task_types t
    WHERE t.category = 'platform' AND lower(t.name) = lower(v.name)
 );
