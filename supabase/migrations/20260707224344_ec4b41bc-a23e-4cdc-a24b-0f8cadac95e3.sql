ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS welcomed_at timestamptz;
UPDATE public.profiles SET welcomed_at = now() WHERE welcomed_at IS NULL;