
-- 1. Merge duplicates (Kanishka: 0001 -> real, Akash: 0004 -> real)

-- attendance_logs: no date collisions verified; safe UPDATE with ON CONFLICT fallback via DELETE-first pattern
UPDATE public.attendance_logs SET user_id = 'e0ce11c3-d6e2-4a37-8fc7-c822ab4912e4'
  WHERE user_id = '11111111-0000-0000-0000-000000000001'
  AND NOT EXISTS (SELECT 1 FROM public.attendance_logs a2 WHERE a2.user_id='e0ce11c3-d6e2-4a37-8fc7-c822ab4912e4' AND a2.date = public.attendance_logs.date);
DELETE FROM public.attendance_logs WHERE user_id = '11111111-0000-0000-0000-000000000001';

UPDATE public.attendance_logs SET user_id = '02cf3091-63b7-42fa-b2a0-bbfb34be5935'
  WHERE user_id = '11111111-0000-0000-0000-000000000004'
  AND NOT EXISTS (SELECT 1 FROM public.attendance_logs a2 WHERE a2.user_id='02cf3091-63b7-42fa-b2a0-bbfb34be5935' AND a2.date = public.attendance_logs.date);
DELETE FROM public.attendance_logs WHERE user_id = '11111111-0000-0000-0000-000000000004';

-- salaries: keep real user's rows; if placeholder has effective_from not already on real, move it; else drop
UPDATE public.salaries SET user_id = 'e0ce11c3-d6e2-4a37-8fc7-c822ab4912e4'
  WHERE user_id = '11111111-0000-0000-0000-000000000001'
  AND NOT EXISTS (SELECT 1 FROM public.salaries s2 WHERE s2.user_id='e0ce11c3-d6e2-4a37-8fc7-c822ab4912e4' AND s2.effective_from = public.salaries.effective_from);
DELETE FROM public.salaries WHERE user_id = '11111111-0000-0000-0000-000000000001';

UPDATE public.salaries SET user_id = '02cf3091-63b7-42fa-b2a0-bbfb34be5935'
  WHERE user_id = '11111111-0000-0000-0000-000000000004'
  AND NOT EXISTS (SELECT 1 FROM public.salaries s2 WHERE s2.user_id='02cf3091-63b7-42fa-b2a0-bbfb34be5935' AND s2.effective_from = public.salaries.effective_from);
DELETE FROM public.salaries WHERE user_id = '11111111-0000-0000-0000-000000000004';

-- leave_requests, punch_sessions: simple re-point
UPDATE public.leave_requests SET user_id = 'e0ce11c3-d6e2-4a37-8fc7-c822ab4912e4' WHERE user_id = '11111111-0000-0000-0000-000000000001';
UPDATE public.leave_requests SET user_id = '02cf3091-63b7-42fa-b2a0-bbfb34be5935' WHERE user_id = '11111111-0000-0000-0000-000000000004';
UPDATE public.punch_sessions SET user_id = 'e0ce11c3-d6e2-4a37-8fc7-c822ab4912e4' WHERE user_id = '11111111-0000-0000-0000-000000000001';
UPDATE public.punch_sessions SET user_id = '02cf3091-63b7-42fa-b2a0-bbfb34be5935' WHERE user_id = '11111111-0000-0000-0000-000000000004';

-- leave_balances: sum into real if both exist, else re-point
INSERT INTO public.leave_balances (user_id, leave_type, allocated, used)
  SELECT 'e0ce11c3-d6e2-4a37-8fc7-c822ab4912e4', leave_type, allocated, used
    FROM public.leave_balances WHERE user_id = '11111111-0000-0000-0000-000000000001'
  ON CONFLICT (user_id, leave_type) DO UPDATE SET allocated = public.leave_balances.allocated + EXCLUDED.allocated, used = public.leave_balances.used + EXCLUDED.used;
DELETE FROM public.leave_balances WHERE user_id = '11111111-0000-0000-0000-000000000001';

INSERT INTO public.leave_balances (user_id, leave_type, allocated, used)
  SELECT '02cf3091-63b7-42fa-b2a0-bbfb34be5935', leave_type, allocated, used
    FROM public.leave_balances WHERE user_id = '11111111-0000-0000-0000-000000000004'
  ON CONFLICT (user_id, leave_type) DO UPDATE SET allocated = public.leave_balances.allocated + EXCLUDED.allocated, used = public.leave_balances.used + EXCLUDED.used;
DELETE FROM public.leave_balances WHERE user_id = '11111111-0000-0000-0000-000000000004';

-- user_roles, super_admins: drop placeholder rows (real user already has proper roles)
DELETE FROM public.user_roles WHERE user_id IN ('11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000004');
DELETE FROM public.super_admins WHERE user_id IN ('11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000004');

-- delete merged placeholder profiles
DELETE FROM public.profiles WHERE id IN ('11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000004');

-- 2. Rename remaining placeholders to official emails, clear is_placeholder
UPDATE public.profiles SET email='deepak@colladome.in',           is_placeholder=false WHERE id='11111111-0000-0000-0000-000000000002';
UPDATE public.profiles SET email='shraddha.saxena@colladome.in',  is_placeholder=false WHERE id='11111111-0000-0000-0000-000000000003';
UPDATE public.profiles SET email='sweksha@colladome.in',          is_placeholder=false WHERE id='11111111-0000-0000-0000-000000000005';
UPDATE public.profiles SET email='chirag@colladome.com',          is_placeholder=false WHERE id='11111111-0000-0000-0000-000000000006';
UPDATE public.profiles SET email='juhi@colladome.com',            is_placeholder=false WHERE id='11111111-0000-0000-0000-000000000007';
UPDATE public.profiles SET email='anjali@colladome.in',           is_placeholder=false WHERE id='11111111-0000-0000-0000-000000000008';
UPDATE public.profiles SET email='neetu@colladome.in',            is_placeholder=false WHERE id='11111111-0000-0000-0000-000000000009';
UPDATE public.profiles SET email='hemanth@colladome.in',          is_placeholder=false WHERE id='11111111-0000-0000-0000-000000000010';
UPDATE public.profiles SET email='manvi@colladome.in',            is_placeholder=false WHERE id='11111111-0000-0000-0000-000000000011';
UPDATE public.profiles SET email='trisha@colladome.in',           is_placeholder=false WHERE id='11111111-0000-0000-0000-000000000012';
