
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS twitter_url text,
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS pinterest_url text,
  ADD COLUMN IF NOT EXISTS social_follows_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviews_confirmed_at timestamptz;
