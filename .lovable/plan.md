## Goal

Open the portal so anyone can sign up / log in with any email. Keep the super-admin-only "view as employee" toggle that already exists so only Shubham and Arti can impersonate other employees.

## Changes

### 1. Remove invite-only signup restriction (migration)

Drop the trigger and function added in the previous turn:

```sql
DROP TRIGGER IF EXISTS enforce_invite_only_signup_trg ON auth.users;
DROP FUNCTION IF EXISTS public.enforce_invite_only_signup();
```

After this, `auth.users` accepts any new signup. The existing `handle_new_user` trigger continues to run and:
- Creates a `profile` row
- Applies any pre-assigned `role_grants` (so if Shubham pre-adds an email on the Access page, that role/salary still applies on first sign-in)
- Otherwise defaults new users to the `employee` role
- Seeds default leave balances

### 2. Update auth page copy

In `src/routes/auth.tsx`, remove the "Only invited email addresses can sign up…" helper text (if present) so the UI reflects open signup.

### 3. Nothing else changes

- **Impersonation is already built:** `useViewAs` + `use-current-user` already lets super admins switch the app view to any employee via the selector in the top bar. Non-super-admins never see the selector. No code changes needed here.
- **Access & Roles page** (`/access`) stays super-admin-only for Shubham/Arti to pre-assign admin/finance/super-admin roles by email — still useful even with open signup.
- No changes to login flow, Google OAuth, RLS, or any other route.

## Result

- Anyone can sign up at `/auth` and lands as a regular employee.
- Shubham and Arti (super admins) keep the "View as" selector in the top bar to impersonate any employee's view.
- Shubham and Arti keep the Access page to grant admin/super-admin privileges by email.