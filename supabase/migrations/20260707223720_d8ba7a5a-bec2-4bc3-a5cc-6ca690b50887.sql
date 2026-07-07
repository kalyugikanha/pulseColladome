
-- 1. Repoint user_id FKs from auth.users to profiles so placeholder profiles can carry data
ALTER TABLE public.punch_sessions DROP CONSTRAINT IF EXISTS punch_sessions_user_id_fkey;
ALTER TABLE public.punch_sessions
  ADD CONSTRAINT punch_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.employee_bank_details DROP CONSTRAINT IF EXISTS employee_bank_details_user_id_fkey;
ALTER TABLE public.employee_bank_details
  ADD CONSTRAINT employee_bank_details_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.employee_documents DROP CONSTRAINT IF EXISTS employee_documents_user_id_fkey;
ALTER TABLE public.employee_documents
  ADD CONSTRAINT employee_documents_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Per-stage project override for workflow templates
ALTER TABLE public.workflow_template_stages
  ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL;
