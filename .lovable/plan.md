## Goal
Give **Akash Jangid** (`project@colladome.com`, department: Project Management) the same permission profile Kanishka enjoys, so he can manage projects and act on his reporting team.

## Current state
| User | Roles | Department head of | Direct reports |
|---|---|---|---|
| Kanishka | employee | **Marketing** | 6 |
| Akash Jangid | employee | — (none) | 1 (Arpit) |

Kanishka's elevated powers come from her `department_heads` row, not from `user_roles`. That flips `is_department_head()` → true, which in turn makes:
- `canManageProjects` true (via `private.can_manage_projects`)
- reporting-manager and department-head data scopes unlock across the app

## Change
Insert one row:
```sql
INSERT INTO public.department_heads (user_id, department)
VALUES ('09974ee0-f2c8-4cc1-81f1-0456832b3d44', 'Project Management')
ON CONFLICT DO NOTHING;
```

No code changes, no schema changes, no touching Aakash (`akash@colladome.in`) — this is the other Akash. Reporting-manager powers over Arpit already flow from the existing `profiles.reporting_manager_id` link.

## Verification
- Query `department_heads` to confirm the row.
- After Akash re-logs in, `useCurrentUser` will return `isDepartmentHead: true`, `canManageProjects: true`, and his sidebar/projects UI will match Kanishka's.
