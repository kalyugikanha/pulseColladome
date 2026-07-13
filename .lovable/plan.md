## Goal

Grant `sandhya@colladome.in` an "Event Admin" capability — mirroring how Shweksha has `learning_admin` — so she can create, edit, delete, and change status on events without full Admin rights. Currently events only allow Admin / Super Admin (RLS + UI both enforce this), and there is no `event_admin` role yet.

## Changes

### 1. Database migration
- Add `event_admin` to the `public.app_role` enum.
- Update the three write policies on `public.events` (`Admins can insert/update/delete events`) so their expression is `private.is_admin(auth.uid()) OR private.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'event_admin')`. SELECT policy stays open to all authenticated users.
- Insert Sandhya's row into `public.user_roles` with role `event_admin` (idempotent, `ON CONFLICT DO NOTHING`).
- Add `role_grants` entry for `sandhya@colladome.in` = `event_admin` so it survives any re-provisioning, matching how learning_admin is granted.

### 2. Current-user hook (`src/hooks/use-current-user.ts`)
- Add `isEventAdmin: boolean` to the shape.
- Compute it from `user_roles` (true when role is `event_admin`, or the user is admin/super admin), including the "view-as" impersonation branch — same pattern as `isLearningAdmin`.

### 3. Events page (`src/routes/_authenticated/events.tsx`)
- Change `canManage` to also include `me?.isEventAdmin`. No other UI changes needed — Add Event button, row actions, and delete confirmation are all already gated on `canManage`.

### 4. Access page role dropdowns (`src/routes/_authenticated/access.tsx` + `src/lib/admin-users.functions.ts`)
- Add `"event_admin"` to the `GrantRole` union and the "Role" `<Select>` options in both the Create-account and Grant-a-role forms, and to the `Role` type in `admin-users.functions.ts`, so future event admins can be granted through the same UI Shweksha was granted from.

### 5. Sidebar (no change)
Events is already visible to everyone, so no navigation gating change is needed.

## Verification
- After migration approval, confirm Sandhya has the row in `user_roles`.
- Typecheck the app (build runs automatically) to catch any missed spot in the role union.
- Sandhya signs out/in → sees Add Event button + row actions on `/events`; RLS lets her write. Non-admin employees still see read-only.

## Out of scope
No changes to any other feature's gating, no new "Events admin" landing page, no navigation entry beyond the existing Events item.
