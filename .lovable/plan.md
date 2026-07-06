## What’s causing Kanishka’s task error
Kanishka is being treated in the UI as someone who can create/assign tasks because she is a department head / manager. But the backend task creation flow currently hits task-related write rules that are stricter than the UI.

Most likely failure path:
- Task row is created first.
- Then task type links are inserted into `task_task_types`.
- For non-admin users like Kanishka, the task type link write policy does not fully match the department-head / reporting-manager create rules, so creation can fail after the main task insert.
- The UI only shows the raw backend error as a toast, so it can look like an unexplained error.

## Fix plan
1. Add a backend migration to align task-type link permissions with task permissions:
   - Allow creators of a task to attach task types.
   - Allow department heads to attach task types for their department assignees.
   - Allow reporting managers to attach task types for their direct reports.
   - Preserve existing admin / project manager permissions.

2. Make task creation transactional in the server function:
   - Create the task and its task-type links together through one backend function/RPC so a partial task is not left behind if the second step fails.
   - Return a clean, user-friendly error if permission or validation fails.

3. Improve the task creation UI error message:
   - Replace raw database messages with clear text such as “You don’t have permission to assign this task/type combination” or “Please choose a project and title.”

4. Verify as Kanishka/view-as:
   - Create a task with selected project, domain/department/type.
   - Confirm the task appears in My Tasks and no hidden partial rows are created.