
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'review' BEFORE 'done';

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_state text NOT NULL DEFAULT 'none' CHECK (review_state IN ('none','pending_review','approved','changes_requested')),
  ADD COLUMN IF NOT EXISTS completion_percent int NOT NULL DEFAULT 0 CHECK (completion_percent BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS tasks_reviewer_idx ON public.tasks(reviewer_id);

CREATE POLICY "tasks: reviewer read" ON public.tasks FOR SELECT TO authenticated
  USING (reviewer_id = auth.uid());
CREATE POLICY "tasks: reviewer update" ON public.tasks FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid()) WITH CHECK (reviewer_id = auth.uid());

CREATE TABLE public.task_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);
CREATE INDEX task_watchers_user_idx ON public.task_watchers(user_id);
GRANT SELECT, INSERT, DELETE ON public.task_watchers TO authenticated;
GRANT ALL ON public.task_watchers TO service_role;
ALTER TABLE public.task_watchers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_task(_task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND (
        private.can_manage_projects(auth.uid())
        OR private.is_admin(auth.uid())
        OR private.is_hr_admin(auth.uid())
        OR private.is_super_admin(auth.uid())
        OR t.assignee_id = auth.uid()
        OR t.reviewer_id = auth.uid()
        OR t.created_by = auth.uid()
        OR (t.assignee_id IS NOT NULL AND private.is_reporting_manager_of(auth.uid(), t.assignee_id))
        OR (t.assignee_id IS NOT NULL AND private.is_head_of_user(auth.uid(), t.assignee_id))
        OR EXISTS (SELECT 1 FROM public.task_watchers w WHERE w.task_id = t.id AND w.user_id = auth.uid())
      )
  );
$$;

CREATE POLICY "watchers: read" ON public.task_watchers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_view_task(task_id));
CREATE POLICY "watchers: insert self" ON public.task_watchers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_view_task(task_id));
CREATE POLICY "watchers: delete self" ON public.task_watchers FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.task_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL,
  from_value text,
  to_value text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_activity_task_idx ON public.task_activity(task_id, created_at DESC);
GRANT SELECT, INSERT ON public.task_activity TO authenticated;
GRANT ALL ON public.task_activity TO service_role;
ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity: read via task" ON public.task_activity FOR SELECT TO authenticated
  USING (public.can_view_task(task_id));
CREATE POLICY "activity: insert self" ON public.task_activity FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND public.can_view_task(task_id));

CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  parent_id uuid REFERENCES public.task_comments(id) ON DELETE CASCADE,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_comments_task_idx ON public.task_comments(task_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments: read via task" ON public.task_comments FOR SELECT TO authenticated
  USING (public.can_view_task(task_id));
CREATE POLICY "comments: insert" ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_view_task(task_id));
CREATE POLICY "comments: update" ON public.task_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.can_view_task(task_id))
  WITH CHECK (public.can_view_task(task_id));
CREATE POLICY "comments: delete own" ON public.task_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid());
CREATE TRIGGER trg_task_comments_updated BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.task_comment_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.task_comments(id) ON DELETE CASCADE,
  label text,
  url text NOT NULL,
  kind text NOT NULL DEFAULT 'link' CHECK (kind IN ('file','link')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_comment_attach_idx ON public.task_comment_attachments(comment_id);
GRANT SELECT, INSERT, DELETE ON public.task_comment_attachments TO authenticated;
GRANT ALL ON public.task_comment_attachments TO service_role;
ALTER TABLE public.task_comment_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attach: read via comment" ON public.task_comment_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.task_comments c WHERE c.id = comment_id AND public.can_view_task(c.task_id)));
CREATE POLICY "attach: insert via comment" ON public.task_comment_attachments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.task_comments c WHERE c.id = comment_id AND c.author_id = auth.uid()));
CREATE POLICY "attach: delete via comment" ON public.task_comment_attachments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.task_comments c WHERE c.id = comment_id AND c.author_id = auth.uid()));

CREATE TABLE public.task_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.task_comments(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_mentions_user_idx ON public.task_mentions(mentioned_user_id, read_at);
GRANT SELECT, INSERT, UPDATE ON public.task_mentions TO authenticated;
GRANT ALL ON public.task_mentions TO service_role;
ALTER TABLE public.task_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentions: read" ON public.task_mentions FOR SELECT TO authenticated
  USING (mentioned_user_id = auth.uid() OR public.can_view_task(task_id));
CREATE POLICY "mentions: insert via comment" ON public.task_mentions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.task_comments c WHERE c.id = comment_id AND c.author_id = auth.uid()));
CREATE POLICY "mentions: mark read" ON public.task_mentions FOR UPDATE TO authenticated
  USING (mentioned_user_id = auth.uid()) WITH CHECK (mentioned_user_id = auth.uid());

CREATE TABLE public.task_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_subtasks_task_idx ON public.task_subtasks(task_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_subtasks TO authenticated;
GRANT ALL ON public.task_subtasks TO service_role;
ALTER TABLE public.task_subtasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subtasks: read via task" ON public.task_subtasks FOR SELECT TO authenticated
  USING (public.can_view_task(task_id));
CREATE POLICY "subtasks: write via task" ON public.task_subtasks FOR ALL TO authenticated
  USING (public.can_view_task(task_id)) WITH CHECK (public.can_view_task(task_id));
CREATE TRIGGER trg_task_subtasks_updated BEFORE UPDATE ON public.task_subtasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.recompute_task_percent()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _task_id uuid := COALESCE(NEW.task_id, OLD.task_id);
  _total int; _done int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE done) INTO _total, _done
  FROM public.task_subtasks WHERE task_id = _task_id;
  IF _total > 0 THEN
    UPDATE public.tasks SET completion_percent = (_done * 100 / _total) WHERE id = _task_id;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER trg_subtasks_percent AFTER INSERT OR UPDATE OR DELETE ON public.task_subtasks
  FOR EACH ROW EXECUTE FUNCTION public.recompute_task_percent();

CREATE TABLE public.task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);
CREATE INDEX task_deps_task_idx ON public.task_dependencies(task_id);
CREATE INDEX task_deps_dep_idx ON public.task_dependencies(depends_on_task_id);
GRANT SELECT, INSERT, DELETE ON public.task_dependencies TO authenticated;
GRANT ALL ON public.task_dependencies TO service_role;
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deps: read via task" ON public.task_dependencies FOR SELECT TO authenticated
  USING (public.can_view_task(task_id) OR public.can_view_task(depends_on_task_id));
CREATE POLICY "deps: write via task" ON public.task_dependencies FOR ALL TO authenticated
  USING (public.can_view_task(task_id)) WITH CHECK (public.can_view_task(task_id));

CREATE TABLE public.weekly_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  week_start date NOT NULL,
  score int NOT NULL CHECK (score BETWEEN 0 AND 10),
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, week_start)
);
CREATE INDEX weekly_scores_emp_idx ON public.weekly_scores(employee_id, week_start DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_scores TO authenticated;
GRANT ALL ON public.weekly_scores TO service_role;
ALTER TABLE public.weekly_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scores: read own or manager" ON public.weekly_scores FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR private.is_admin(auth.uid())
    OR private.is_hr_admin(auth.uid())
    OR private.is_super_admin(auth.uid())
    OR private.is_reporting_manager_of(auth.uid(), employee_id)
  );
CREATE POLICY "scores: manager write" ON public.weekly_scores FOR ALL TO authenticated
  USING (
    private.is_admin(auth.uid())
    OR private.is_hr_admin(auth.uid())
    OR private.is_super_admin(auth.uid())
    OR private.is_reporting_manager_of(auth.uid(), employee_id)
  )
  WITH CHECK (
    private.is_admin(auth.uid())
    OR private.is_hr_admin(auth.uid())
    OR private.is_super_admin(auth.uid())
    OR private.is_reporting_manager_of(auth.uid(), employee_id)
  );
CREATE TRIGGER trg_weekly_scores_updated BEFORE UPDATE ON public.weekly_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.task_comments(id) ON DELETE CASCADE,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notif_user_idx ON public.notifications(user_id, read_at, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif: read own" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notif: mark own" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notif: insert any auth" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "notif: delete own" ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "task-attach: read auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments');
CREATE POLICY "task-attach: upload auth" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "task-attach: delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
