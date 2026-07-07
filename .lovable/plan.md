## Production reset — wipe operational data

Keep: employees (profiles, roles, super_admins, role_grants), projects, taxonomies, holidays, department settings/heads, leave balances (allocations preserved, `used` zeroed), salaries, bank details, employee documents, recurring task templates.

### Delete (data-only, in FK-safe order)

**Task graph** (keeping rows where `tasks.is_recurring_template = true`, plus their `task_task_types` links):
- `task_comment_attachments`, `task_comments`, `task_mentions`, `task_review_comments`, `task_ratings`, `task_watchers`, `task_dependencies`, `task_activity`, `task_subtasks`
- `task_task_types` where task is not a template
- `tasks` where `is_recurring_template = false`

**Time / attendance**:
- `punch_sessions`
- `attendance_logs`

**Ops history**:
- `weekly_scores`, `notifications`, `assistant_messages`, `impersonation_audit`

**BD + calendars + workflows + misc**:
- `bd_activity_logs`, `bd_recurring_items`
- `vendor_payments`, `vendors`, `marketing_clients`
- `team_calendar_bookings`
- `workflow_instances`
- `google_calendar_events`, `google_calendar_tokens`

**Leave balances tweak**: keep rows, set `used = 0` for all types (allocations preserved). Also delete all `leave_requests` (asked to wipe "everything"; history not in the keep-list).

### Not touched

Employees, projects, holidays, department_heads/settings, taxonomy_*, leave_balances allocations, salaries, employee_bank_details, employee_documents, super_admins, role_grants, user_roles, recurring task templates.

### Verify

Row counts on `tasks`, `attendance_logs`, `punch_sessions`, `bd_activity_logs`, `notifications` after cleanup.
