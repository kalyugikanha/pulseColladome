## Restrict signup to invited emails only

Only emails in `role_grants` (which already includes shubham@colladome.com and arti@colladome.com) may create an account. Anyone else attempting signup gets rejected.

### Change
Add a `BEFORE INSERT` trigger on `auth.users` — `public.enforce_invite_only_signup()` — that:
- Checks `lower(NEW.email)` against `role_grants.email`.
- If no match, `RAISE EXCEPTION 'Signups are restricted. Ask an admin to invite %.', NEW.email USING ERRCODE = '22023';`.
- Otherwise returns NEW, and the existing `handle_new_user` `AFTER INSERT` trigger then provisions profile/role/salary as today.

Supabase surfaces the exception message to the client, so the auth page just shows "Signups are restricted…".

### UI copy (optional, small)
Update the sign-up form helper text on `/auth` to say "Only invited email addresses can sign up. Contact an admin if you need access." — no logic change.

### Not doing
- No change to `handle_new_user` (still runs after insert for invited users).
- No change to login flow — password login and Google OAuth already only work for existing users, so no extra gate needed there.
- No change to role assignment — `role_grants` already drives roles and Shubham/Arti already have `is_finance_admin`.

### Files touched
- New migration: trigger + function.
- `src/routes/auth.tsx` — one line of helper text (optional).
