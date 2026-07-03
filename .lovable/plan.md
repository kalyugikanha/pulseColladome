## Why he doesn't have it yet

Akash's `project_manager` role is saved in **Access & Roles** (role_grants), but he has no real login — only the June 2026 *placeholder* profile used for seeding hours. Roles are applied when `handle_new_user` fires on his first real sign-in, so until an actual auth account exists his session has no `project_manager` row in `user_roles` and `canManageProjects` is false.

## Fix (one action, no code changes)

Open **Access & Roles → Create account** and fill in:

- Full name: `Akash`
- Email: `akash@colladome.in`
- Role: `Project Manager`
- Super admin: `No`
- Monthly salary: `40000` (optional; already in role_grants)

Click **Create account**. That runs the `createTeamUser` server function which:

1. Upserts his `role_grants` row (already `project_manager`, kept as-is).
2. Creates the auth user with temporary password **`Test@123`** and `email_confirm: true`.
3. The `handle_new_user` trigger writes his `profiles` row and inserts `user_roles = project_manager`.
4. Sets `must_change_password = true`, so on first sign-in he's forced to `/change-password` before entering the app.

After that, when Akash signs in:
- Sidebar shows **Projects** (with create/edit), **Hours Editor**, and standard employee items.
- Finances, Project Burn, Vendors, Access & Roles stay hidden.
- His June placeholder attendance rows stay under the placeholder id (separate profile); if you want those merged into his new id later, tell me and I'll add a one-shot repoint.

No code or migration is needed for this — everything is already wired.