
-- ============================================================
-- TAXONOMY: Domains -> Departments -> Task Types
-- ============================================================
CREATE TABLE public.taxonomy_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxonomy_domains TO authenticated;
GRANT ALL ON public.taxonomy_domains TO service_role;
ALTER TABLE public.taxonomy_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "domains: read all auth" ON public.taxonomy_domains FOR SELECT TO authenticated USING (true);
CREATE POLICY "domains: admin write" ON public.taxonomy_domains FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_domains_updated BEFORE UPDATE ON public.taxonomy_domains
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.taxonomy_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id uuid NOT NULL REFERENCES public.taxonomy_domains(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxonomy_departments TO authenticated;
GRANT ALL ON public.taxonomy_departments TO service_role;
ALTER TABLE public.taxonomy_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_dept: read all auth" ON public.taxonomy_departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "tax_dept: admin write" ON public.taxonomy_departments FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_tax_dept_updated BEFORE UPDATE ON public.taxonomy_departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.taxonomy_task_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES public.taxonomy_departments(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_custom boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxonomy_task_types TO authenticated;
GRANT ALL ON public.taxonomy_task_types TO service_role;
ALTER TABLE public.taxonomy_task_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_types: read all auth" ON public.taxonomy_task_types FOR SELECT TO authenticated USING (true);
-- Any authenticated user can self-add a custom type
CREATE POLICY "tax_types: user add custom" ON public.taxonomy_task_types FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND is_custom = true);
-- Admins full control
CREATE POLICY "tax_types: admin write" ON public.taxonomy_task_types FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_tax_types_updated BEFORE UPDATE ON public.taxonomy_task_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- ROLE-BASED presets: role_key can be app_role or department name
-- ============================================================
CREATE TABLE public.role_task_type_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL,
  task_type_id uuid NOT NULL REFERENCES public.taxonomy_task_types(id) ON DELETE CASCADE,
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_key, task_type_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_task_type_presets TO authenticated;
GRANT ALL ON public.role_task_type_presets TO service_role;
ALTER TABLE public.role_task_type_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_presets: read all auth" ON public.role_task_type_presets FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_presets: admin write" ON public.role_task_type_presets FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

-- ============================================================
-- USER personal presets
-- ============================================================
CREATE TABLE public.user_task_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text,
  domain_id uuid REFERENCES public.taxonomy_domains(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.taxonomy_departments(id) ON DELETE CASCADE,
  task_type_id uuid REFERENCES public.taxonomy_task_types(id) ON DELETE CASCADE,
  use_count int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain_id, department_id, task_type_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_task_presets TO authenticated;
GRANT ALL ON public.user_task_presets TO service_role;
ALTER TABLE public.user_task_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_presets: own read" ON public.user_task_presets FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "user_presets: own write" ON public.user_task_presets FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_user_presets_updated BEFORE UPDATE ON public.user_task_presets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TASKS extensions
-- ============================================================
ALTER TABLE public.tasks
  ADD COLUMN asset_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN domain_id uuid REFERENCES public.taxonomy_domains(id) ON DELETE SET NULL,
  ADD COLUMN department_id uuid REFERENCES public.taxonomy_departments(id) ON DELETE SET NULL,
  ADD COLUMN template_id uuid;

-- Multi-tag junction
CREATE TABLE public.task_task_types (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  task_type_id uuid NOT NULL REFERENCES public.taxonomy_task_types(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, task_type_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_task_types TO authenticated;
GRANT ALL ON public.task_task_types TO service_role;
ALTER TABLE public.task_task_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ttt: read via task" ON public.task_task_types FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id
    AND (private.can_manage_projects(auth.uid()) OR t.assignee_id = auth.uid() OR t.created_by = auth.uid()
         OR (t.assignee_id IS NOT NULL AND private.is_head_of_user(auth.uid(), t.assignee_id))))
);
CREATE POLICY "ttt: write via task" ON public.task_task_types FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id
    AND (private.can_manage_projects(auth.uid()) OR t.assignee_id = auth.uid() OR t.created_by = auth.uid()
         OR (t.assignee_id IS NOT NULL AND private.is_head_of_user(auth.uid(), t.assignee_id))))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id
    AND (private.can_manage_projects(auth.uid()) OR t.assignee_id = auth.uid() OR t.created_by = auth.uid()
         OR (t.assignee_id IS NOT NULL AND private.is_head_of_user(auth.uid(), t.assignee_id))))
);

-- ============================================================
-- TASK TEMPLATES (recurring)
-- ============================================================
CREATE TYPE public.task_recurrence AS ENUM ('none','weekly','monthly');

CREATE TABLE public.task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  domain_id uuid REFERENCES public.taxonomy_domains(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.taxonomy_departments(id) ON DELETE SET NULL,
  default_assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  asset_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  recurrence public.task_recurrence NOT NULL DEFAULT 'monthly',
  day_of_month int,
  weekday int,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_templates TO authenticated;
GRANT ALL ON public.task_templates TO service_role;
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates: manager read" ON public.task_templates FOR SELECT TO authenticated USING (
  private.can_manage_projects(auth.uid())
  OR private.is_department_head(auth.uid())
  OR created_by = auth.uid()
);
CREATE POLICY "templates: manager write" ON public.task_templates FOR ALL TO authenticated USING (
  private.can_manage_projects(auth.uid())
  OR (default_assignee_id IS NOT NULL AND private.is_head_of_user(auth.uid(), default_assignee_id))
  OR created_by = auth.uid()
) WITH CHECK (
  private.can_manage_projects(auth.uid())
  OR (default_assignee_id IS NOT NULL AND private.is_head_of_user(auth.uid(), default_assignee_id))
  OR created_by = auth.uid()
);
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON public.task_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.task_template_task_types (
  template_id uuid NOT NULL REFERENCES public.task_templates(id) ON DELETE CASCADE,
  task_type_id uuid NOT NULL REFERENCES public.taxonomy_task_types(id) ON DELETE CASCADE,
  PRIMARY KEY (template_id, task_type_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_template_task_types TO authenticated;
GRANT ALL ON public.task_template_task_types TO service_role;
ALTER TABLE public.task_template_task_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tttt: read via template" ON public.task_template_task_types FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.task_templates tt WHERE tt.id = template_id
    AND (private.can_manage_projects(auth.uid()) OR private.is_department_head(auth.uid()) OR tt.created_by = auth.uid()))
);
CREATE POLICY "tttt: write via template" ON public.task_template_task_types FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.task_templates tt WHERE tt.id = template_id
    AND (private.can_manage_projects(auth.uid()) OR tt.created_by = auth.uid()
         OR (tt.default_assignee_id IS NOT NULL AND private.is_head_of_user(auth.uid(), tt.default_assignee_id))))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.task_templates tt WHERE tt.id = template_id
    AND (private.can_manage_projects(auth.uid()) OR tt.created_by = auth.uid()
         OR (tt.default_assignee_id IS NOT NULL AND private.is_head_of_user(auth.uid(), tt.default_assignee_id))))
);

-- Add FK for template_id after templates table exists
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.task_templates(id) ON DELETE SET NULL;

-- ============================================================
-- SEED taxonomy
-- ============================================================
INSERT INTO public.taxonomy_domains (name, sort) VALUES ('Colladome', 0), ('Client Work', 10);

WITH d AS (SELECT id FROM public.taxonomy_domains WHERE name = 'Colladome')
INSERT INTO public.taxonomy_departments (domain_id, name, sort)
SELECT d.id, x.name, x.sort FROM d, (VALUES
  ('Marketing', 0), ('Video', 10), ('Design', 20), ('Content', 30),
  ('Development', 40), ('Business Development', 50), ('HR', 60),
  ('Finance', 70), ('Admin', 80), ('Project Management', 90)
) AS x(name, sort);

-- Global (no department) types
INSERT INTO public.taxonomy_task_types (department_id, name) VALUES
  (NULL, 'Meeting'), (NULL, 'Research'), (NULL, 'Planning'), (NULL, 'Review');

-- Department-scoped types
WITH types(dept, name) AS (VALUES
  ('Marketing','Content Writing'),('Marketing','Posting'),('Marketing','Scheduling'),
  ('Marketing','Strategy'),('Marketing','Campaign Setup'),('Marketing','Analytics'),
  ('Video','Video Editing'),('Video','Scripting'),('Video','Raw Cut'),
  ('Video','Motion Graphics'),('Video','Color Grading'),('Video','Shoot'),
  ('Design','Designing'),('Design','Graphics'),('Design','Illustration'),
  ('Design','Branding'),('Design','UI Design'),
  ('Content','Content Writing'),('Content','Copyediting'),('Content','SEO'),
  ('Development','Frontend'),('Development','Backend'),('Development','Bug Fix'),
  ('Development','Code Review'),('Development','QA'),
  ('Business Development','Outreach'),('Business Development','Proposal'),('Business Development','Client Call')
)
INSERT INTO public.taxonomy_task_types (department_id, name)
SELECT td.id, t.name
FROM types t
JOIN public.taxonomy_departments td ON td.name = t.dept
JOIN public.taxonomy_domains dd ON dd.id = td.domain_id AND dd.name = 'Colladome';

-- Role presets: link department name -> matching dept types
INSERT INTO public.role_task_type_presets (role_key, task_type_id)
SELECT td.name, tt.id
FROM public.taxonomy_task_types tt
JOIN public.taxonomy_departments td ON td.id = tt.department_id;
