## Diagnosis

Two separate issues:

1. **Arti is not actually a super admin in the database.** In `role_grants` she is set as `role='employee', is_super_admin=false`, and she has no row in `super_admins` and no entry in `user_roles`. So `me.isSuperAdmin` is false for her — and every gate (Vendors page, project edit, etc.) correctly denies her.

2. **The Vendors page crashes for any non-super-admin** because `VendorsPage` does `throw redirect({ to: "/dashboard" })` inside the component render. TanStack Router treats that as a render error, not a navigation, so the error boundary shows "Something went wrong" — which is what Arti sees.

## Fix

### 1. Promote Arti to super admin (migration)
- Update `role_grants` for `arti@colladome.com`: set `role='admin'`, `is_super_admin=true`.
- Backfill for her existing account (id `9869d739-…`):
  - Insert into `super_admins`.
  - Insert `('admin')` into `user_roles` (ON CONFLICT DO NOTHING).

### 2. Fix the Vendors route guard (frontend only)
In `src/routes/_authenticated/vendors.tsx`:
- Remove `throw redirect(...)` from the component body.
- While `me` is loading, render a small loading state.
- Once `me` is loaded and `!me.isSuperAdmin`, use `useEffect` + `useNavigate` to send them to `/dashboard`, and render nothing meanwhile.

### 3. Hide the Vendors sidebar link for non-super-admins
In `src/routes/_authenticated/route.tsx`, only render the "Vendors" nav item when `me?.isSuperAdmin`, so employees like Arti wouldn't have seen the link before promotion.

No RLS changes, no changes to vendor schema or business logic.