CREATE OR REPLACE FUNCTION private.can_manage_projects(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT private.is_admin(_user_id)
      OR private.has_role(_user_id, 'project_manager')
      OR private.is_hr_admin(_user_id)
      OR private.is_department_head(_user_id);
$function$;