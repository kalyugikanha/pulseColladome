
-- Allow learning admins / admins to submit proof on behalf of a user (needed for impersonation and admin-assisted uploads).
DROP POLICY IF EXISTS "course_submissions insert own" ON public.course_submissions;
CREATE POLICY "course_submissions insert own or admin"
  ON public.course_submissions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR private.is_learning_admin(auth.uid())
    OR private.is_admin(auth.uid())
  );

-- Storage: allow admins to insert/update proof files in any user's folder.
DROP POLICY IF EXISTS "learning-proofs insert own" ON storage.objects;
CREATE POLICY "learning-proofs insert own or admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'learning-proofs' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR private.is_learning_admin(auth.uid())
      OR private.is_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "learning-proofs update own" ON storage.objects;
CREATE POLICY "learning-proofs update own or admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'learning-proofs' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR private.is_learning_admin(auth.uid())
      OR private.is_admin(auth.uid())
    )
  );
