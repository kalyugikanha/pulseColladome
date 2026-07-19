
-- Table
CREATE TABLE public.task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL DEFAULT auth.uid(),
  file_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_attachments_task_id_idx ON public.task_attachments(task_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_attachments TO authenticated;
GRANT ALL ON public.task_attachments TO service_role;

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View attachments if can view task"
  ON public.task_attachments FOR SELECT TO authenticated
  USING (public.can_view_task(task_id));

CREATE POLICY "Upload attachments if can view task"
  ON public.task_attachments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = uploader_id AND public.can_view_task(task_id));

CREATE POLICY "Delete own or as admin/creator"
  ON public.task_attachments FOR DELETE TO authenticated
  USING (
    uploader_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin'))
    OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
  );

-- Storage policies on task-attachments bucket
CREATE POLICY "task-attachments read if can view task"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND (storage.foldername(name))[1] = 'tasks'
    AND public.can_view_task(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "task-attachments upload if can view task"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-attachments'
    AND (storage.foldername(name))[1] = 'tasks'
    AND public.can_view_task(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "task-attachments delete own or admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND (
      owner = auth.uid()
      OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin'))
      OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
    )
  );
