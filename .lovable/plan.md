## Migrate Sandeep to `sandeep.suman@colladome.in`

### Why the current sign-in fails
When Sandeep tries to sign in with `sandeep.suman@colladome.in`, our `handle_new_user` trigger finds a `profiles` row already using that email (my earlier rename) but with a different `id`. It then runs a "swap" branch that reparents ~13 tables and deletes the old row. However, ~15 other tables that reference `profiles(id)` — task assignments, comments, mentions, watchers, activity, BD logs, notifications, weekly scores, workflow attributions, etc. — are NOT covered by that swap. On the final `DELETE` those rows either cascade-delete (destroying his history) or SET NULL (blanking his tasks/reviewer attribution). The whole trigger then either raises inside the swap or completes with silent data loss — either way, the Supabase callback bounces him back to `/auth`.

### Fix — two-phase migration (safe, no data loss)

**Phase A (migration, one SQL run):**
1. Revert `profiles.email` for id `38290b50…` back to `sandeep@colladome.in` so the trigger's swap branch does NOT fire when he next signs in.
2. Insert a `role_grants` row for `sandeep.suman@colladome.in` with role `employee` and `reporting_manager_email = 'kanishka@colladome.in'`, so the trigger seeds his new profile with the right role and manager instead of defaulting to admin/no-manager.

**Phase B (after Sandeep signs in once with `sandeep.suman@colladome.in` via Google):**
A second migration that runs a single transaction:
1. Look up the new auth user id for `sandeep.suman@colladome.in`; abort with a clear error if it doesn't exist yet.
2. Reparent EVERY table that references `profiles(id)` from old id `38290b50…` → new id, covering all 31 FKs identified (attendance, tasks assignee/reviewer/requester, task_comments/mentions/watchers/activity/review_comments, bd_activity_logs, bd_recurring_items, notifications, weekly_scores, workflow_instances/templates/stages, leave_requests, leave_balances, salaries, punch_sessions, employee_bank/documents, google_calendar_*, team_calendar_bookings, `profiles.reporting_manager_id`, `profiles.onboarding_approved_by`, department_heads, user_roles, super_admins, onboarding_section_state, impersonation_audit, task_ratings, task_attachments, assistant_messages, etc.).
3. Copy his full profile payload (name, personal_email, phone, address, DOB, department, joined_on, socials, bank details) from old profile → new profile row created by the trigger, so nothing is lost.
4. Delete the old `auth.users` row for `sandeep@colladome.in` (which cascade-deletes the now-empty old profile).
5. Delete the old `role_grants` row for `sandeep@colladome.in`.

### Deliverables
- **Phase A migration** — ships now, unblocks his sign-in.
- **Message to user** — "Ask Sandeep to sign in once with `sandeep.suman@colladome.in`, then tell me — I'll run Phase B to finish the switch."
- **Phase B migration** — deferred until you confirm he has signed in.

Preview only, no publish.
