Delete every row from the `tasks` table (all users, all projects, including recurring templates). This will cascade through related task tables (comments, subtasks, dependencies, watchers, activity, ratings, mentions, review comments, task_task_types, workflow_instances references, etc.) depending on FK settings.

This is irreversible. No code or schema changes — data only, via a single `DELETE FROM public.tasks;` using the insert tool.

Confirm to proceed.