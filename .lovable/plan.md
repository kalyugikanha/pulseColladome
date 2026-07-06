Promote `shraddha.saxena@colladome.in` to HR admin so she can access HR Leaves and Employee Onboarding.

### Changes (data-only, no code)

Run a single insert/upsert:

1. `public.user_roles` — insert `(user_id = Shraddha's id, role = 'hr_admin')` (ON CONFLICT do nothing).
2. `public.role_grants` — upsert `email='shraddha.saxena@colladome.in'` with `role='hr_admin'`, `department='HR'` so any future re-provisioning keeps the role.

No schema, RLS, or UI changes — the HR sidebar links and RLS policies for `hr_admin` are already in place.

After running, Shraddha will need to sign out/in (or refresh) once for `useCurrentUser` to pick up the new role.
