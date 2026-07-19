
-- 1) Profile columns for full onboarding
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personal_email text,
  ADD COLUMN IF NOT EXISTS permanent_address text,
  ADD COLUMN IF NOT EXISTS marriage_anniversary date,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS github_url text,
  ADD COLUMN IF NOT EXISTS profile_picture_url text,
  ADD COLUMN IF NOT EXISTS day_start_time time,
  ADD COLUMN IF NOT EXISTS standup_time time,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- 2) Bank details
CREATE TABLE IF NOT EXISTS public.employee_bank_details (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_holder_name text NOT NULL,
  account_number text NOT NULL,
  bank_branch text NOT NULL,
  ifsc_code text NOT NULL,
  pan_number text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_bank_details TO authenticated;
GRANT ALL ON public.employee_bank_details TO service_role;

ALTER TABLE public.employee_bank_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank: self read" ON public.employee_bank_details
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "bank: self write" ON public.employee_bank_details
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "bank: self update" ON public.employee_bank_details
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "bank: hr/super read" ON public.employee_bank_details
  FOR SELECT TO authenticated USING (private.is_super_admin(auth.uid()) OR private.is_hr_admin(auth.uid()));

CREATE TRIGGER trg_bank_updated_at BEFORE UPDATE ON public.employee_bank_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Documents
DO $$ BEGIN
  CREATE TYPE public.employee_doc_type AS ENUM (
    'offer_letter','aadhar','pan','cancelled_cheque',
    'marksheet_10','marksheet_12','graduation','masters',
    'resume','profile_picture'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type public.employee_doc_type NOT NULL,
  storage_path text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, doc_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "docs: self read" ON public.employee_documents
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "docs: self insert" ON public.employee_documents
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "docs: self update" ON public.employee_documents
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "docs: hr/super read" ON public.employee_documents
  FOR SELECT TO authenticated USING (private.is_super_admin(auth.uid()) OR private.is_hr_admin(auth.uid()));

-- 4) Storage policies on employee-documents bucket (files stored under `${uid}/...`)
CREATE POLICY "employee-documents: self upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "employee-documents: self update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "employee-documents: hr/super read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (private.is_super_admin(auth.uid()) OR private.is_hr_admin(auth.uid()))
  );

CREATE POLICY "employee-documents: self read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
