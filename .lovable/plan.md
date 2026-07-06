## Why Kanishka can't see her created templates

`listTaskTemplates` embeds the assignee profile using
`assignee:profiles!task_templates_default_assignee_id_fkey(...)`, but that
FK actually points at `auth.users`, not `public.profiles`. PostgREST can't
resolve the embed, returns an error, and the handler silently swallows it
with `const { data } = await ...; return data ?? []` — so the page always
receives `[]` and shows "No templates yet", even though the row exists and
RLS allows Kanishka (department head + created_by) to read it.

Verified in the DB:
- Template row exists: `Oswal Reels`, `created_by = Kanishka`.
- `task_templates_default_assignee_id_fkey` → `auth.users(id)`.
- Elsewhere we use `tasks_assignee_profile_fkey` on `tasks` that correctly
  points to `profiles(id)` — this template embed was never wired the same way.

## Why the "field no longer available" toast fires (Anjali's Create task)

That toast is the `taskCreateError` mapping of Postgres `23503` (foreign-key
violation) from `create_task_full`. All the referenced taxonomy rows in the
screenshot do exist, so the failing FK is most likely one of the newer ones
added to `public.tasks` — `tasks_assignee_profile_fkey` (assignee must exist
in `profiles`) or `tasks_reviewer_id_fkey` (reviewer must exist in
`profiles`) — for an account whose `profiles` row wasn't created. Because
the current error handler collapses every 23503 into the same generic
message, we can't see which constraint tripped.

## Fix plan

### 1. Templates list embed (root cause of Kanishka's issue)

Migration:
- Add `task_templates_default_assignee_profile_fkey`:
  `FOREIGN KEY (default_assignee_id) REFERENCES public.profiles(id) ON DELETE SET NULL`.
- Add `task_templates_created_by_profile_fkey` (same shape) so we can embed
  the creator too if needed.

`src/lib/tasks-plus.functions.ts` — `listTaskTemplates`:
- Change embed hint to
  `assignee:profiles!task_templates_default_assignee_profile_fkey(...)`.
- Stop swallowing errors: destructure `{ data, error }`, and on `error`
  `throw new Error(error.message)` so future embed/RLS problems surface in
  the toast instead of silently emptying the page.

### 2. Task creation error diagnostics + auto-heal

`src/lib/tasks-plus.functions.ts` — `taskCreateError`:
- When code is `23503`, inspect `error.details` / `error.message` for the
  constraint name and return a specific message:
  - `tasks_assignee_profile_fkey` → "Selected assignee has no profile yet.
    Ask an admin to sync them, then try again."
  - `tasks_reviewer_id_fkey` → same wording for reviewer.
  - `tasks_project_id_fkey` → "This project no longer exists. Refresh and
    pick another."
  - `task_task_types_task_type_id_fkey` → "One of the selected task types
    was deleted. Reselect and try again."
  - fallback keeps the current generic string.

`create_task_full` RPC migration (self-heal for the profile FK case):
- Before inserting the task, `INSERT ... ON CONFLICT DO NOTHING` into
  `public.profiles(id, full_name, email)` using data from `auth.users` for
  both `_assignee_id` and the reviewer path so any authenticated user with a
  valid `auth.users` row automatically gets a matching `profiles` row and
  the FK cannot fail. This is the same pattern we use for other create RPCs.

### 3. Verify

- Reload Task Templates as Kanishka → "Oswal Reels" appears with assignee
  chip populated.
- Anjali creates a fresh task with reviewer = Kanishka → succeeds; if any
  FK still fails, the toast now names the field.

## Files touched

- new migration: add profile FKs on `task_templates`, patch
  `create_task_full` to backfill missing profile rows.
- `src/lib/tasks-plus.functions.ts` — fix embed hint, throw on list error,
  richer `taskCreateError` mapping.

No UI/component changes required.