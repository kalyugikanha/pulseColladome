
-- Ensure Chirag is on the Business Development team
UPDATE public.profiles
   SET department = 'Business Development'
 WHERE lower(email) = 'chirag@colladome.com'
   AND (department IS NULL OR department <> 'Business Development');

-- Idempotent reporting-tree assertions (only writes when currently NULL or different)
DO $$
DECLARE _shubham uuid; _juhi uuid;
BEGIN
  SELECT id INTO _shubham FROM public.profiles WHERE lower(email) = 'shubham@colladome.com' LIMIT 1;
  SELECT id INTO _juhi    FROM public.profiles WHERE lower(email) = 'juhi@colladome.com'    LIMIT 1;

  IF _shubham IS NOT NULL THEN
    UPDATE public.profiles SET reporting_manager_id = _shubham
     WHERE lower(email) IN ('juhi@colladome.com','jagjeet@colladome.in','chirag@colladome.com')
       AND (reporting_manager_id IS DISTINCT FROM _shubham);
  END IF;

  IF _juhi IS NOT NULL THEN
    UPDATE public.profiles SET reporting_manager_id = _juhi
     WHERE lower(email) IN ('riyanshi@colladome.in','sarita@colladome.in')
       AND (reporting_manager_id IS DISTINCT FROM _juhi);
  END IF;
END $$;

-- Grant execute on can_view_task so TaskDetailSheet works for signed-in users
GRANT EXECUTE ON FUNCTION public.can_view_task(uuid) TO authenticated;
