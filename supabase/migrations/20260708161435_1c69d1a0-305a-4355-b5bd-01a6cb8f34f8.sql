ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS at_risk boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unlogged_hours_balance numeric NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unlogged_hours_since date;