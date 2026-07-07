
-- Recursive walk of the reporting tree (excludes the manager themselves)
CREATE OR REPLACE FUNCTION private.bd_report_ids(_manager uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE tree AS (
    SELECT id FROM public.profiles WHERE reporting_manager_id = _manager
    UNION
    SELECT p.id FROM public.profiles p
    JOIN tree t ON p.reporting_manager_id = t.id
  )
  SELECT id FROM tree;
$$;

-- True if actor can manage the target user's BD workflow
CREATE OR REPLACE FUNCTION private.can_manage_bd_user(_actor uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _actor = _target
    OR private.is_admin(_actor)
    OR private.is_super_admin(_actor)
    OR EXISTS (SELECT 1 FROM private.bd_report_ids(_actor) r WHERE r = _target);
$$;

-- Set of user IDs the actor may see in BD (self + subtree; admins → all active)
CREATE OR REPLACE FUNCTION private.bd_visible_user_ids(_actor uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles
  WHERE is_active = true
    AND (
      private.is_admin(_actor)
      OR private.is_super_admin(_actor)
      OR id = _actor
      OR id IN (SELECT r FROM private.bd_report_ids(_actor) r)
    );
$$;

-- New columns on bd_activity_logs for one-off assigned tasks
ALTER TABLE public.bd_activity_logs
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title text;

-- Replace bd_recurring_items policies
DROP POLICY IF EXISTS "bd_recurring admin write" ON public.bd_recurring_items;
DROP POLICY IF EXISTS "bd_recurring assignee read" ON public.bd_recurring_items;

CREATE POLICY "bd_recurring visible read"
  ON public.bd_recurring_items
  FOR SELECT
  USING (assignee_id IN (SELECT u FROM private.bd_visible_user_ids(auth.uid()) u));

CREATE POLICY "bd_recurring manager insert"
  ON public.bd_recurring_items
  FOR INSERT
  WITH CHECK (private.can_manage_bd_user(auth.uid(), assignee_id));

CREATE POLICY "bd_recurring manager update"
  ON public.bd_recurring_items
  FOR UPDATE
  USING (private.can_manage_bd_user(auth.uid(), assignee_id))
  WITH CHECK (private.can_manage_bd_user(auth.uid(), assignee_id));

CREATE POLICY "bd_recurring manager delete"
  ON public.bd_recurring_items
  FOR DELETE
  USING (private.can_manage_bd_user(auth.uid(), assignee_id));

-- Replace bd_activity_logs policies
DROP POLICY IF EXISTS "bd_logs owner read" ON public.bd_activity_logs;
DROP POLICY IF EXISTS "bd_logs owner insert" ON public.bd_activity_logs;
DROP POLICY IF EXISTS "bd_logs owner update" ON public.bd_activity_logs;
DROP POLICY IF EXISTS "bd_logs owner delete" ON public.bd_activity_logs;

CREATE POLICY "bd_logs visible read"
  ON public.bd_activity_logs
  FOR SELECT
  USING (user_id IN (SELECT u FROM private.bd_visible_user_ids(auth.uid()) u));

CREATE POLICY "bd_logs manager insert"
  ON public.bd_activity_logs
  FOR INSERT
  WITH CHECK (private.can_manage_bd_user(auth.uid(), user_id));

CREATE POLICY "bd_logs manager update"
  ON public.bd_activity_logs
  FOR UPDATE
  USING (private.can_manage_bd_user(auth.uid(), user_id))
  WITH CHECK (private.can_manage_bd_user(auth.uid(), user_id));

CREATE POLICY "bd_logs manager delete"
  ON public.bd_activity_logs
  FOR DELETE
  USING (private.can_manage_bd_user(auth.uid(), user_id));

-- Public wrapper so the client can list visible users through supabase-js .rpc()
CREATE OR REPLACE FUNCTION public.bd_list_visible_users()
RETURNS TABLE (id uuid, full_name text, email text, department text, reporting_manager_id uuid, is_direct_report boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, p.department, p.reporting_manager_id,
         (p.reporting_manager_id = auth.uid()) AS is_direct_report
  FROM public.profiles p
  WHERE p.id IN (SELECT u FROM private.bd_visible_user_ids(auth.uid()) u)
  ORDER BY (p.id = auth.uid()) DESC, p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.bd_list_visible_users() TO authenticated;
