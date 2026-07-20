
CREATE TABLE public.trainee_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.trainee_applications TO anon;
GRANT INSERT ON public.trainee_applications TO authenticated;
GRANT SELECT, UPDATE ON public.trainee_applications TO authenticated;
GRANT ALL ON public.trainee_applications TO service_role;

ALTER TABLE public.trainee_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a trainee application"
  ON public.trainee_applications FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND rejection_reason IS NULL
  );

CREATE POLICY "HR and super admins can view trainee applications"
  ON public.trainee_applications FOR SELECT
  TO authenticated
  USING (private.is_super_admin(auth.uid()) OR private.is_hr_admin(auth.uid()));

CREATE POLICY "HR and super admins can update trainee applications"
  ON public.trainee_applications FOR UPDATE
  TO authenticated
  USING (private.is_super_admin(auth.uid()) OR private.is_hr_admin(auth.uid()))
  WITH CHECK (private.is_super_admin(auth.uid()) OR private.is_hr_admin(auth.uid()));

CREATE TRIGGER trainee_applications_set_updated_at
  BEFORE UPDATE ON public.trainee_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX trainee_applications_status_created_idx
  ON public.trainee_applications (status, created_at DESC);
