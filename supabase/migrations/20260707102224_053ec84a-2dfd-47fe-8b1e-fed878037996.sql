
DROP POLICY IF EXISTS "tasks: marketing kanban read all" ON public.tasks;

ALTER TABLE public.tasks
  DROP COLUMN IF EXISTS marketing_stage,
  DROP COLUMN IF EXISTS current_stage_id,
  DROP COLUMN IF EXISTS is_multi_stage,
  DROP COLUMN IF EXISTS template_id;

DROP FUNCTION IF EXISTS public.advance_task_stage(uuid, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.set_task_stages(uuid, jsonb) CASCADE;

DROP TABLE IF EXISTS public.task_stage_events CASCADE;
DROP TABLE IF EXISTS public.task_stages CASCADE;
DROP TABLE IF EXISTS public.task_template_task_types CASCADE;
DROP TABLE IF EXISTS public.task_templates CASCADE;
DROP TABLE IF EXISTS public.role_task_type_presets CASCADE;
DROP TABLE IF EXISTS public.user_task_presets CASCADE;

DROP TYPE IF EXISTS public.task_stage_kind CASCADE;
DROP TYPE IF EXISTS public.task_stage_status CASCADE;
DROP TYPE IF EXISTS public.marketing_stage CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  em text := lower(NEW.email);
  domain text := lower(split_part(NEW.email, '@', 2));
  g record; ph record; is_first boolean; mgr_id uuid;
BEGIN
  IF domain NOT IN ('colladome.com', 'colladome.in') THEN
    RAISE EXCEPTION 'Only @colladome.com or @colladome.in Google accounts are allowed. Please contact HR.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO g FROM public.role_grants WHERE lower(email) = em LIMIT 1;
  IF g.reporting_manager_email IS NOT NULL THEN
    SELECT id INTO mgr_id FROM public.profiles WHERE lower(email) = lower(g.reporting_manager_email) LIMIT 1;
  END IF;
  SELECT * INTO ph FROM public.profiles WHERE lower(email) = em LIMIT 1;
  IF ph.id IS NOT NULL AND ph.id <> NEW.id THEN
    UPDATE public.profiles SET email = NULL WHERE id = ph.id;
    INSERT INTO public.profiles (
      id, full_name, email, avatar_url, must_change_password,
      onboarding_completed, onboarding_required,
      department, date_of_birth, joined_on, phone, employment_type, notes,
      personal_email, permanent_address, marriage_anniversary,
      linkedin_url, github_url, profile_picture_url, day_start_time, standup_time,
      facebook_url, instagram_url, twitter_url, youtube_url, pinterest_url,
      reporting_manager_id, is_active, is_placeholder
    ) VALUES (
      NEW.id,
      COALESCE(ph.full_name, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'avatar_url', ph.avatar_url),
      false, ph.onboarding_completed, COALESCE(ph.onboarding_required, true),
      COALESCE(g.department, ph.department),
      ph.date_of_birth, ph.joined_on, ph.phone, ph.employment_type, ph.notes,
      ph.personal_email, ph.permanent_address, ph.marriage_anniversary,
      ph.linkedin_url, ph.github_url, ph.profile_picture_url, ph.day_start_time, ph.standup_time,
      ph.facebook_url, ph.instagram_url, ph.twitter_url, ph.youtube_url, ph.pinterest_url,
      COALESCE(mgr_id, ph.reporting_manager_id), COALESCE(ph.is_active, true), false
    );
    UPDATE public.attendance_logs        SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.google_calendar_events SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.leave_requests         SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.salaries               SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.tasks                  SET assignee_id = NEW.id WHERE assignee_id = ph.id;
    UPDATE public.team_calendar_bookings SET created_by  = NEW.id WHERE created_by  = ph.id;
    UPDATE public.profiles               SET reporting_manager_id = NEW.id WHERE reporting_manager_id = ph.id;
    UPDATE public.leave_balances         SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.punch_sessions         SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.employee_bank_details  SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.employee_documents     SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.google_calendar_tokens SET user_id     = NEW.id WHERE user_id     = ph.id;
    UPDATE public.department_heads       SET user_id     = NEW.id WHERE user_id     = ph.id;
    DELETE FROM public.profiles WHERE id = ph.id;
  ELSIF ph.id IS NULL THEN
    INSERT INTO public.profiles (
      id, full_name, email, avatar_url, must_change_password,
      onboarding_completed, onboarding_required, department, reporting_manager_id
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
      NEW.email, NEW.raw_user_meta_data->>'avatar_url',
      false, false, true, g.department, mgr_id
    );
  END IF;
  IF g.email IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, g.role) ON CONFLICT DO NOTHING;
    IF g.is_super_admin THEN
      INSERT INTO public.super_admins (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    END IF;
    IF g.default_monthly_salary IS NOT NULL THEN
      INSERT INTO public.salaries (user_id, monthly_salary, effective_from, currency)
        VALUES (NEW.id, g.default_monthly_salary, CURRENT_DATE, 'INR')
        ON CONFLICT (user_id, effective_from) DO UPDATE SET monthly_salary = EXCLUDED.monthly_salary;
    END IF;
  ELSE
    SELECT NOT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO is_first;
    INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'employee'::public.app_role END)
      ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.leave_balances (user_id, leave_type, allocated) VALUES
    (NEW.id, 'casual', 5),(NEW.id, 'sick', 5),(NEW.id, 'earned', 0),(NEW.id, 'unpaid', 0)
  ON CONFLICT DO NOTHING;
  UPDATE public.profiles p SET reporting_manager_id = NEW.id
  FROM public.role_grants rg
  WHERE lower(rg.email) = lower(p.email)
    AND lower(rg.reporting_manager_email) = em
    AND (p.reporting_manager_id IS NULL OR p.reporting_manager_id <> NEW.id);
  RETURN NEW;
END;
$function$;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS workflow_template_id uuid,
  ADD COLUMN IF NOT EXISTS workflow_instance_id uuid,
  ADD COLUMN IF NOT EXISTS stage_index int,
  ADD COLUMN IF NOT EXISTS stage_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS required_fields_values jsonb;

CREATE INDEX IF NOT EXISTS tasks_workflow_instance_idx ON public.tasks(workflow_instance_id);

CREATE TABLE public.workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  department text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_templates TO authenticated;
GRANT ALL ON public.workflow_templates TO service_role;
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wf_templates_read_all" ON public.workflow_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "wf_templates_admin_write" ON public.workflow_templates FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()))
  WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));
CREATE TRIGGER trg_wf_templates_updated_at BEFORE UPDATE ON public.workflow_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.workflow_template_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  position int NOT NULL,
  name text NOT NULL,
  requires_review boolean NOT NULL DEFAULT false,
  default_assignee_id uuid REFERENCES public.profiles(id),
  default_due_offset_days int,
  required_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  branch_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  branch_target_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, position)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_template_stages TO authenticated;
GRANT ALL ON public.workflow_template_stages TO service_role;
ALTER TABLE public.workflow_template_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wf_stages_read_all" ON public.workflow_template_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "wf_stages_admin_write" ON public.workflow_template_stages FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()))
  WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

CREATE TABLE public.workflow_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.workflow_templates(id),
  project_id uuid REFERENCES public.projects(id),
  started_by uuid NOT NULL REFERENCES public.profiles(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  root_task_id uuid,
  current_stage_position int NOT NULL DEFAULT 1
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_instances TO authenticated;
GRANT ALL ON public.workflow_instances TO service_role;
ALTER TABLE public.workflow_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wf_instances_read_all" ON public.workflow_instances FOR SELECT TO authenticated USING (true);
CREATE POLICY "wf_instances_write_any_signed" ON public.workflow_instances FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TABLE public.task_review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  body text,
  kind text NOT NULL CHECK (kind IN ('comment','request_changes','approve')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.task_review_comments TO authenticated;
GRANT ALL ON public.task_review_comments TO service_role;
ALTER TABLE public.task_review_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trc_read_if_can_view_task" ON public.task_review_comments FOR SELECT TO authenticated
  USING (public.can_view_task(task_id));
CREATE POLICY "trc_insert_if_can_view_task" ON public.task_review_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_view_task(task_id));

DROP POLICY IF EXISTS "tasks_insert_signed_in" ON public.tasks;
CREATE POLICY "tasks_insert_signed_in" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DO $$
DECLARE tpl_id uuid;
BEGIN
  INSERT INTO public.workflow_templates (name, description, department, is_active)
  VALUES ('Marketing Content Production', 'Storyboard -> Video/Design -> Review -> Post', 'Marketing', true)
  RETURNING id INTO tpl_id;

  INSERT INTO public.workflow_template_stages
    (template_id, position, name, requires_review, required_fields, branch_options, branch_target_map)
  VALUES
    (tpl_id, 1, 'Storyboarding', false, '[]'::jsonb,
      '[{"key":"video","label":"Send to Video Editing"},{"key":"design","label":"Send to Designing"}]'::jsonb,
      '{"video":2,"design":3}'::jsonb),
    (tpl_id, 2, 'Video Editing', true, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb),
    (tpl_id, 3, 'Designing', true, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb),
    (tpl_id, 4, 'Social Media Posting', false,
      '[{"key":"screenshot","kind":"attachment","label":"Post screenshot","required":true},{"key":"published_url","kind":"url","label":"Where published (link)","required":true}]'::jsonb,
      '[]'::jsonb, '{}'::jsonb);
END $$;
