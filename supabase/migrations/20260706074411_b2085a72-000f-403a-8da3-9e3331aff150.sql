
CREATE POLICY "leave: hr admin manage" ON public.leave_requests
  FOR ALL TO authenticated
  USING (private.is_hr_admin(auth.uid()))
  WITH CHECK (private.is_hr_admin(auth.uid()));

CREATE POLICY "leave balances: hr admin read" ON public.leave_balances
  FOR SELECT TO authenticated
  USING (private.is_hr_admin(auth.uid()));

CREATE POLICY "leave balances: hr admin update" ON public.leave_balances
  FOR UPDATE TO authenticated
  USING (private.is_hr_admin(auth.uid()))
  WITH CHECK (private.is_hr_admin(auth.uid()));
