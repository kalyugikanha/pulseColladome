## Nuke `sandeep@colladome.in`

Wipe the old account and everything cascading from it. Sandeep starts fresh when he signs in as `sandeep.suman@colladome.in`.

### Single migration

Inside one transaction, in this order:
1. `DELETE FROM public.role_grants WHERE lower(email) = 'sandeep@colladome.in';` — retires the old access grant so it never seeds a re-signup.
2. `DELETE FROM auth.users WHERE lower(email) = 'sandeep@colladome.in';` — deletes the Supabase auth user for the old Google account.

Cascade effect of step 2 (`profiles.id` FKs `auth.users` with `ON DELETE CASCADE`, and downstream tables cascade further):
- Profile row `38290b50…` — deleted
- Cascade-deleted rows: attendance_logs, bd_activity_logs (user_id), bd_recurring_items (assignee), employee_bank_details, employee_documents, google_calendar_events, google_calendar_tokens, leave_requests, leave_balances, notifications, punch_sessions, salaries, task_comments (author), task_mentions, task_watchers, team_calendar_bookings (created_by), weekly_scores (employee_id), department_heads, user_roles, super_admins, onboarding_section_state, impersonation_audit, task_ratings, task_attachments, assistant_messages, task_review_comments (if FK cascades — otherwise blocks; see below).
- SET NULL: tasks (assignee/reviewer/requester), bd_activity_logs (assigned_by), bd_recurring_items (created_by), task_activity (actor/approved_by), task_comments (resolved_by), weekly_scores (manager_id), workflow_template_stages (default_reviewer_id/default_assignee_id — if the FK is SET NULL), profiles.reporting_manager_id on his 1 direct report → becomes NULL, profiles.onboarding_approved_by.
- Potentially BLOCKING FKs (no ON DELETE clause = RESTRICT): `task_review_comments.author_id`, `workflow_instances.started_by`, `workflow_templates.created_by`, `workflow_template_stages.default_assignee_id`. If Sandeep created any of these, the DELETE will fail.

### Blocking-FK handling
Before the two DELETEs, run a pre-clean that nulls out or reassigns Sandeep's references in the restrict-FK tables so the cascade can complete:
- `UPDATE public.workflow_instances SET started_by = NULL WHERE started_by = '38290b50…';` (make the column nullable in the same migration if it isn't — check first; if it must stay NOT NULL, reassign to a super admin instead).
- `UPDATE public.workflow_templates SET created_by = <super_admin_id> WHERE created_by = '38290b50…';`
- `UPDATE public.workflow_template_stages SET default_assignee_id = NULL WHERE default_assignee_id = '38290b50…';` (nullable check same as above).
- `DELETE FROM public.task_review_comments WHERE author_id = '38290b50…';` (his review-comment history is discarded, matching the "nuke" intent).

I'll query each restrict-FK's column nullability and pick NULL vs reassignment accordingly inside the migration.

### After the migration
- The 1 profile that reported to him gets `reporting_manager_id = NULL` — HR can reassign later. I'll flag which profile in the message.
- When Sandeep next signs in with `sandeep.suman@colladome.in`, the `handle_new_user` trigger creates a brand-new profile with role `employee`, department `Marketing`, reporting manager `Kanishka`, salary ₹13,000 (from the `role_grants` row already seeded in Phase A).

Preview only, no publish.
