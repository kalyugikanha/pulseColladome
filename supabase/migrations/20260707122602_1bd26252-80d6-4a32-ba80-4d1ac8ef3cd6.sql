
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence_freq text NOT NULL DEFAULT 'none' CHECK (recurrence_freq IN ('none','daily','weekly')),
  ADD COLUMN IF NOT EXISTS recurrence_days int[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_recurring_template boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_recurrence_parent_due_unique
  ON public.tasks (recurrence_parent_id, due_date)
  WHERE recurrence_parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_is_recurring_template_idx
  ON public.tasks (is_recurring_template) WHERE is_recurring_template = true;

CREATE OR REPLACE FUNCTION public.generate_recurring_task_occurrences()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
  today date := current_date;
  dow int := EXTRACT(ISODOW FROM current_date)::int; -- 1=Mon..7=Sun
  matches boolean;
BEGIN
  FOR t IN
    SELECT * FROM public.tasks WHERE is_recurring_template = true
  LOOP
    matches := false;
    IF t.recurrence_freq = 'daily' THEN
      matches := true;
    ELSIF t.recurrence_freq = 'weekly' AND t.recurrence_days IS NOT NULL THEN
      matches := dow = ANY(t.recurrence_days);
    END IF;
    IF NOT matches THEN CONTINUE; END IF;

    BEGIN
      INSERT INTO public.tasks (
        project_id, title, description, priority, status,
        assignee_id, created_by, asset_links, domain_id, department_id,
        estimated_hours, due_date, recurrence_parent_id
      ) VALUES (
        t.project_id, t.title, t.description, t.priority, 'todo',
        t.assignee_id, t.created_by, COALESCE(t.asset_links,'[]'::jsonb),
        t.domain_id, t.department_id, t.estimated_hours, today, t.id
      );

      INSERT INTO public.task_task_types (task_id, task_type_id)
      SELECT currval(pg_get_serial_sequence('public.tasks','id')), tt.task_type_id
      FROM public.task_task_types tt WHERE tt.task_id = t.id
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
END;
$$;

-- tasks.id is uuid, not serial, so the task_task_types copy above is invalid.
-- Replace with a correct version that captures the new row's id explicitly.
CREATE OR REPLACE FUNCTION public.generate_recurring_task_occurrences()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
  today date := current_date;
  dow int := EXTRACT(ISODOW FROM current_date)::int; -- 1=Mon..7=Sun
  matches boolean;
  new_task_id uuid;
BEGIN
  FOR t IN
    SELECT * FROM public.tasks WHERE is_recurring_template = true
  LOOP
    matches := false;
    IF t.recurrence_freq = 'daily' THEN
      matches := true;
    ELSIF t.recurrence_freq = 'weekly' AND t.recurrence_days IS NOT NULL THEN
      matches := dow = ANY(t.recurrence_days);
    END IF;
    IF NOT matches THEN CONTINUE; END IF;

    BEGIN
      INSERT INTO public.tasks (
        project_id, title, description, priority, status,
        assignee_id, created_by, asset_links, domain_id, department_id,
        estimated_hours, due_date, recurrence_parent_id
      ) VALUES (
        t.project_id, t.title, t.description, t.priority, 'todo',
        t.assignee_id, t.created_by, COALESCE(t.asset_links,'[]'::jsonb),
        t.domain_id, t.department_id, t.estimated_hours, today, t.id
      )
      RETURNING id INTO new_task_id;

      INSERT INTO public.task_task_types (task_id, task_type_id)
      SELECT new_task_id, tt.task_type_id
      FROM public.task_task_types tt WHERE tt.task_id = t.id
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_recurring_task_occurrences() TO authenticated;
