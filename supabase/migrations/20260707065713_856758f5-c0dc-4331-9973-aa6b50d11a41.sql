
DO $$
DECLARE
  grp RECORD;
  survivor uuid;
  loser uuid;
BEGIN
  FOR grp IN
    SELECT lower(email) AS em, array_agg(id ORDER BY is_placeholder ASC, is_active DESC NULLS LAST, created_at ASC) AS ids
    FROM public.profiles
    WHERE email IS NOT NULL
    GROUP BY lower(email)
    HAVING count(*) > 1
  LOOP
    survivor := grp.ids[1];
    FOREACH loser IN ARRAY grp.ids[2:array_length(grp.ids,1)] LOOP
      UPDATE public.attendance_logs        SET user_id     = survivor WHERE user_id     = loser;
      UPDATE public.google_calendar_events SET user_id     = survivor WHERE user_id     = loser;
      UPDATE public.leave_requests         SET user_id     = survivor WHERE user_id     = loser;
      UPDATE public.salaries               SET user_id     = survivor WHERE user_id     = loser;
      UPDATE public.tasks                  SET assignee_id = survivor WHERE assignee_id = loser;
      UPDATE public.team_calendar_bookings SET created_by  = survivor WHERE created_by  = loser;
      UPDATE public.profiles               SET reporting_manager_id = survivor WHERE reporting_manager_id = loser;
      UPDATE public.leave_balances         SET user_id     = survivor WHERE user_id     = loser
        AND NOT EXISTS (SELECT 1 FROM public.leave_balances lb2 WHERE lb2.user_id = survivor AND lb2.leave_type = public.leave_balances.leave_type);
      DELETE FROM public.leave_balances WHERE user_id = loser;
      UPDATE public.punch_sessions         SET user_id     = survivor WHERE user_id     = loser;
      UPDATE public.employee_bank_details  SET user_id     = survivor WHERE user_id     = loser;
      UPDATE public.employee_documents     SET user_id     = survivor WHERE user_id     = loser;
      UPDATE public.google_calendar_tokens SET user_id     = survivor WHERE user_id     = loser;
      UPDATE public.user_task_presets      SET user_id     = survivor WHERE user_id     = loser;
      UPDATE public.department_heads       SET user_id     = survivor WHERE user_id     = loser;
      DELETE FROM public.profiles WHERE id = loser;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_unique
  ON public.profiles (lower(email))
  WHERE email IS NOT NULL;
