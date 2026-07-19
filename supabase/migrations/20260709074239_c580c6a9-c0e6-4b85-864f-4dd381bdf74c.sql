
UPDATE public.workflow_template_stages
SET default_assignee_id = NULL
WHERE default_assignee_id = '38290b50-49a9-4af3-9f3f-a052497d63cb';

DELETE FROM public.role_grants
WHERE lower(email) = 'sandeep@colladome.in';

DELETE FROM auth.users
WHERE lower(email) = 'sandeep@colladome.in';
