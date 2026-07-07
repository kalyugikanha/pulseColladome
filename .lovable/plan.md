## Two changes

### 1. Don't block seeding on "have they signed up?"

Root cause: `punch_sessions.user_id`, `employee_bank_details.user_id`, and `employee_documents.user_id` all FK to `auth.users(id)`, which excludes placeholder profiles (users who haven't signed in yet). But the `handle_new_user` trigger already re-parents these rows from placeholder → real profile on first sign-in.

Fix (migration):
- Drop the three `..._user_id_fkey` constraints that reference `auth.users(id)`.
- Recreate each as a FK to `profiles(id) ON DELETE CASCADE`.
- After the migration, re-run the June-30 seed to cover Deepak (5 rows / 200h) and Sweksha (2 rows / 200h). Their placeholder profile IDs will migrate to their real auth IDs on first Google sign-in.

Behavior stays the same for existing users; RLS still hinges on `auth.uid() = user_id`, and for placeholder rows that check just returns false — no one but the target user (once they sign in) or an HR admin can see them.

### 2. Per-stage project dropdown in workflow templates

Right now a workflow instance carries one `project_id` and every stage's task inherits it. Add a per-stage override so a template can cross projects.

Migration:
- `workflow_template_stages.project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL`
- No default (NULL means "use the instance's project").

Server (`src/lib/workflows.functions.ts`):
- Extend `WorkflowStageInput` with `project_id: string | null`.
- Persist it in the stage insert/update.
- In `advanceWorkflowTaskFromStage` (and initial stage creation), pass `next_stage.project_id ?? instance.project_id` to `create_task_full`.

UI (`src/routes/_authenticated/workflows.tsx`, `StageEditor`):
- New "Project" select per stage. Options: "Same as workflow" (null) + all active projects. Uses existing project fetcher (already used in board Kanban); add a lightweight fetch in the workflows route loader.
- Show the selected project code beside each stage badge in the list view.

No changes to `workflow_instances` shape — instance-level project stays as the default.

### Verify

- Punch: re-run the seed and confirm Deepak + Sweksha totals appear in the same query.
- Template: create a 2-stage template with different projects, launch an instance, close stage 1, and confirm stage 2's task is created against the other project.
