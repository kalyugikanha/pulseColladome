## Changes

### 1. Allow 0 hours when marking a task done
`src/components/tasks/mark-done-dialog.tsx` — change validation from `hoursNum > 0` to `hoursNum >= 0` so recurring tasks with no time spent that day can still be submitted for approval. Placeholder/help text stays the same.

### 2. "Onboarding not required" toggle in HR Admin → Directory
Add an admin-controlled per-user flag that lets the app skip the "complete onboarding first" gate for that user.

**Database (migration)**
- Add `profiles.onboarding_required boolean not null default true`.
- No RLS change needed (profiles already has HR/super-admin update policies); toggle is written via a `createServerFn` that verifies caller is super-admin or HR admin.

**Server**
- New `src/lib/hr-directory.functions.ts` exporting `setOnboardingRequired({ user_id, required })` — `requireSupabaseAuth` + role check (`is_super_admin` / `has_role('hr_admin')`), updates `profiles.onboarding_required`.

**Onboarding gate**
- Wherever the app currently redirects unfinished users to `/complete-onboarding` / `/onboarding-pending` (checked in `src/routes/_authenticated/route.tsx` and/or `use-current-user`), treat `onboarding_required === false` as "gate passes" so the user can navigate freely.
- `useCurrentUser` returns the new field so UI can read it.

**UI**
- `src/routes/_authenticated/directory.tsx` (Team Directory, visible under HR Admin tab set and to super admin): add a compact "Onboarding required" checkbox column/toggle on each row, only rendered when `me.isSuperAdmin || me.isHrAdmin`. Toggling calls the server fn and invalidates the directory query. Non-admins don't see the control.

### Verification
- Mark-done dialog: entering `0` enables the submit button.
- As super admin, uncheck "Onboarding required" for a pending user → that user can load `/dashboard` and other routes without being bounced to the onboarding flow. Re-check restores the gate.

### Out of scope
No change to the onboarding form itself, approvals flow, or the welcome overlay.
