DROP TRIGGER IF EXISTS enforce_invite_only_signup_trg ON auth.users;
DROP FUNCTION IF EXISTS public.enforce_invite_only_signup();