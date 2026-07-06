
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarding_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_rejection_reason text,
  ADD COLUMN IF NOT EXISTS hobbies text;

ALTER TYPE public.employee_doc_type ADD VALUE IF NOT EXISTS 'follow_facebook';
ALTER TYPE public.employee_doc_type ADD VALUE IF NOT EXISTS 'follow_instagram';
ALTER TYPE public.employee_doc_type ADD VALUE IF NOT EXISTS 'follow_twitter';
ALTER TYPE public.employee_doc_type ADD VALUE IF NOT EXISTS 'follow_linkedin';
ALTER TYPE public.employee_doc_type ADD VALUE IF NOT EXISTS 'follow_youtube';
ALTER TYPE public.employee_doc_type ADD VALUE IF NOT EXISTS 'follow_pinterest';
ALTER TYPE public.employee_doc_type ADD VALUE IF NOT EXISTS 'follow_whatsapp';
ALTER TYPE public.employee_doc_type ADD VALUE IF NOT EXISTS 'review_google_jaipur';
ALTER TYPE public.employee_doc_type ADD VALUE IF NOT EXISTS 'review_google_hyderabad';
ALTER TYPE public.employee_doc_type ADD VALUE IF NOT EXISTS 'review_glassdoor';
ALTER TYPE public.employee_doc_type ADD VALUE IF NOT EXISTS 'review_ambitionbox';
ALTER TYPE public.employee_doc_type ADD VALUE IF NOT EXISTS 'linkedin_employment';
