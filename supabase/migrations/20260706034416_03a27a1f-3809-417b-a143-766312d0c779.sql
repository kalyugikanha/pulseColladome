CREATE POLICY "leave: reporting manager create"
  ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (private.is_reporting_manager_of(auth.uid(), user_id));

CREATE POLICY "leave: dept head create"
  ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (private.is_head_of_user(auth.uid(), user_id));