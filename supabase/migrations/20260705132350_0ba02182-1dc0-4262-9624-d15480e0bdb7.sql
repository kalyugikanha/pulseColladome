DROP POLICY IF EXISTS "domains: admin write" ON public.taxonomy_domains;
CREATE POLICY "domains: admin or head write" ON public.taxonomy_domains FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.department_heads dh WHERE dh.user_id = auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.department_heads dh WHERE dh.user_id = auth.uid()));

DROP POLICY IF EXISTS "tax_dept: admin write" ON public.taxonomy_departments;
CREATE POLICY "tax_dept: admin or head write" ON public.taxonomy_departments FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.department_heads dh WHERE dh.user_id = auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.department_heads dh WHERE dh.user_id = auth.uid()));

DROP POLICY IF EXISTS "tax_types: admin write" ON public.taxonomy_task_types;
CREATE POLICY "tax_types: admin or head write" ON public.taxonomy_task_types FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.department_heads dh WHERE dh.user_id = auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.department_heads dh WHERE dh.user_id = auth.uid()));
