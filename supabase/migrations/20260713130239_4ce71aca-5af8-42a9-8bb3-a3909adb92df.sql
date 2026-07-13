
-- 1. Add event_admin to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'event_admin';
