CREATE OR REPLACE FUNCTION public.enforce_invite_only_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL THEN
    RAISE EXCEPTION 'Signups require an email address.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.role_grants WHERE lower(email) = lower(NEW.email)) THEN
    RAISE EXCEPTION 'Signups are restricted. Ask an admin to invite %.', NEW.email USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_invite_only_signup_trg ON auth.users;
CREATE TRIGGER enforce_invite_only_signup_trg
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_invite_only_signup();