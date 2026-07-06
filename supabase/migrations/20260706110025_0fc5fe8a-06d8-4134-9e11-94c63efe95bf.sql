CREATE OR REPLACE FUNCTION private.is_finance_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND lower(email) = 'shubham@colladome.com');
$function$;