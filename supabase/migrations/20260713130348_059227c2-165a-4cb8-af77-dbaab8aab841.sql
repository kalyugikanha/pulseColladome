
DROP POLICY IF EXISTS "Admins can insert events" ON public.events;
DROP POLICY IF EXISTS "Admins can update events" ON public.events;
DROP POLICY IF EXISTS "Admins can delete events" ON public.events;

CREATE POLICY "Admins can insert events" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()) OR private.has_role(auth.uid(), 'event_admin'::public.app_role));

CREATE POLICY "Admins can update events" ON public.events
  FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()) OR private.has_role(auth.uid(), 'event_admin'::public.app_role))
  WITH CHECK (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()) OR private.has_role(auth.uid(), 'event_admin'::public.app_role));

CREATE POLICY "Admins can delete events" ON public.events
  FOR DELETE TO authenticated
  USING (private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()) OR private.has_role(auth.uid(), 'event_admin'::public.app_role));

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'event_admin'::public.app_role FROM public.profiles
WHERE lower(email) = 'sandhya@colladome.in'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_grants (email, role, is_super_admin)
VALUES ('sandhya@colladome.in', 'event_admin'::public.app_role, false)
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;
