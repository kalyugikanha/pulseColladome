
-- Expenses table for Finances > Expenses tracking (admin-only)
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  amount_inr numeric(14,2) NOT NULL CHECK (amount_inr >= 0),
  expense_date date NOT NULL,
  category text NOT NULL CHECK (category IN (
    'software_subscriptions','travel','ai_tools','admin_utilities','professional_fees','other'
  )),
  proof_path text,
  recurring boolean NOT NULL DEFAULT false,
  scope text NOT NULL CHECK (scope IN ('project','department','company')),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  department text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_scope_target CHECK (
    (scope = 'project'    AND project_id IS NOT NULL AND department IS NULL) OR
    (scope = 'department' AND department IS NOT NULL AND project_id IS NULL) OR
    (scope = 'company'    AND project_id IS NULL AND department IS NULL)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses admin all"
  ON public.expenses FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()));

CREATE INDEX expenses_date_idx ON public.expenses(expense_date);
CREATE INDEX expenses_project_idx ON public.expenses(project_id) WHERE project_id IS NOT NULL;

CREATE TRIGGER expenses_set_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage RLS for expense-proofs bucket (private).
-- Uploader writes into their own {uid}/... folder; admins can read/write anywhere.
CREATE POLICY "expense-proofs read admin"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-proofs' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR private.is_admin(auth.uid())
      OR private.is_super_admin(auth.uid())
    )
  );

CREATE POLICY "expense-proofs insert admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-proofs' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR private.is_admin(auth.uid())
      OR private.is_super_admin(auth.uid())
    )
  );

CREATE POLICY "expense-proofs update admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'expense-proofs' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR private.is_admin(auth.uid())
      OR private.is_super_admin(auth.uid())
    )
  );

CREATE POLICY "expense-proofs delete admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-proofs' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR private.is_admin(auth.uid())
      OR private.is_super_admin(auth.uid())
    )
  );
