
-- Helper: learning admin check
CREATE OR REPLACE FUNCTION private.is_learning_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'learning_admin'
  );
$$;

-- Trigger fn (reuse existing set_updated_at if present)

-- ================= courses =================
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  resource_url text,
  due_date date NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courses read for authenticated"
  ON public.courses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "courses write for learning admins"
  ON public.courses FOR ALL TO authenticated
  USING (private.is_learning_admin(auth.uid()) OR private.is_admin(auth.uid()))
  WITH CHECK (private.is_learning_admin(auth.uid()) OR private.is_admin(auth.uid()));

CREATE TRIGGER courses_set_updated_at BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================= course_targets =================
CREATE TABLE public.course_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  department text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_targets_one_kind CHECK (
    (user_id IS NOT NULL AND department IS NULL)
    OR (user_id IS NULL AND department IS NOT NULL)
  )
);
CREATE UNIQUE INDEX course_targets_user_uq ON public.course_targets(course_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX course_targets_dept_uq ON public.course_targets(course_id, department) WHERE department IS NOT NULL;
CREATE INDEX course_targets_user_idx ON public.course_targets(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX course_targets_dept_idx ON public.course_targets(department) WHERE department IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_targets TO authenticated;
GRANT ALL ON public.course_targets TO service_role;
ALTER TABLE public.course_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_targets read for authenticated"
  ON public.course_targets FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "course_targets write for learning admins"
  ON public.course_targets FOR ALL TO authenticated
  USING (private.is_learning_admin(auth.uid()) OR private.is_admin(auth.uid()))
  WITH CHECK (private.is_learning_admin(auth.uid()) OR private.is_admin(auth.uid()));

-- ================= course_submissions =================
CREATE TABLE public.course_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  screenshot_path text NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  rejection_note text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_submissions TO authenticated;
GRANT ALL ON public.course_submissions TO service_role;
ALTER TABLE public.course_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_submissions read own or admin"
  ON public.course_submissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_learning_admin(auth.uid()) OR private.is_admin(auth.uid()));

CREATE POLICY "course_submissions insert own"
  ON public.course_submissions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "course_submissions update own not-approved"
  ON public.course_submissions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status <> 'approved')
  WITH CHECK (user_id = auth.uid() AND status <> 'approved');

CREATE POLICY "course_submissions update by admin"
  ON public.course_submissions FOR UPDATE TO authenticated
  USING (private.is_learning_admin(auth.uid()) OR private.is_admin(auth.uid()))
  WITH CHECK (private.is_learning_admin(auth.uid()) OR private.is_admin(auth.uid()));

CREATE POLICY "course_submissions delete by admin"
  ON public.course_submissions FOR DELETE TO authenticated
  USING (private.is_learning_admin(auth.uid()) OR private.is_admin(auth.uid()));

CREATE TRIGGER course_submissions_set_updated_at BEFORE UPDATE ON public.course_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================= Storage policies =================
-- learning-proofs bucket: path convention "{user_id}/{course_id}-{ts}-{name}"
CREATE POLICY "learning-proofs read own or admin"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'learning-proofs' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR private.is_learning_admin(auth.uid())
      OR private.is_admin(auth.uid())
    )
  );

CREATE POLICY "learning-proofs insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'learning-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "learning-proofs update own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'learning-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "learning-proofs delete own or admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'learning-proofs' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR private.is_learning_admin(auth.uid())
      OR private.is_admin(auth.uid())
    )
  );
