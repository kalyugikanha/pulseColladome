## Three changes

### 1. Task Overview — Edit / Duplicate / Delete per row

In `src/routes/_authenticated/tasks-overview.tsx`:
- Add an **Actions** column with a kebab menu (DropdownMenu) exposing **Edit**, **Duplicate**, **Delete**.
- **Edit** opens the existing `TaskDetailSheet` (same one used elsewhere) which already supports edit.
- **Duplicate** inserts a new task with the same title (`+ " (copy)"`), description, project, priority, due_date, department_id, domain_id, assignee, and asset_links; status resets to `todo`; created_by = me. Uses the existing `create_task_full` RPC to keep taxonomy handling consistent.
- **Delete** shows a confirm dialog, then deletes the task (RLS restricts to admins / creator / project managers — same rules as the detail sheet). Invalidate `["tasks-overview", …]` on success.
- Permission gate on the menu: only render Edit/Delete when `me.isAdmin || me.isSuperAdmin || me.canManageProjects || row.created_by === me.id`. Duplicate is allowed for anyone who can view.

### 2. Punch-out task picker — assignee-only, searchable, "request a task" fallback

In `src/routes/_authenticated/punch.tsx`:
- The task list is already filtered to `assignee_id = user` and non-done. Keep that.
- Replace the plain `<Select>` in each row with a **searchable combobox** (`Command` + `Popover` from shadcn/ui) that filters by task title and project code as the user types.
- Under the combobox, add a small link **"Can't find your task? Request one from your manager"** which opens a `RequestTaskDialog`:
  - Fields: **Title** (required), **Project** (optional dropdown from the projects list), **Note** (optional).
  - Submits to a new SECURITY DEFINER RPC `request_task_from_manager(_title, _project_id, _note)` that:
    - Resolves the recipient: caller's `reporting_manager_id`; if null, first `department_heads.user_id` for the caller's department; if still none, first `admin` in `user_roles`.
    - Inserts a `notifications` row with `kind='task_request'`, `body='<caller name> needs a task: "<title>"<note>'`, `user_id=recipient`. Task_id stays null.
  - On success: toast "Request sent" and close.
- The existing `requireTask` guard stays, so Marketing / BD users still can't punch out until they pick a real task — the request flow is just a shortcut to unblock creation.

### 3. Notification tray in top bar

New component `src/components/notifications-bell.tsx`:
- Bell icon button in `top-bar.tsx` (left of the "Live" indicator), with an unread-count badge.
- Popover shows the latest ~20 notifications for `auth.uid()`, unread first. Each row: kind icon + body + relative time; clicking a row marks it read (updates `read_at`) and, if `task_id` is set, opens `TaskDetailSheet` for that task. Task-request rows navigate to `/tasks` so the manager can create it.
- **"Mark all read"** button clears unread `read_at`.
- Subscribes to realtime inserts on `public.notifications` filtered by `user_id=eq.<me>` for instant updates (channel torn down on unmount per Realtime rules). Polling fallback: `refetchOnWindowFocus`.

### Database

Single migration:
1. `ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;` (guarded so it's a no-op if already added).
2. Create `public.request_task_from_manager(_title text, _project_id uuid default null, _note text default null) returns uuid` — SECURITY DEFINER, `SET search_path = public`. Resolves recipient as described and inserts the notification. Grants EXECUTE to `authenticated`.
3. No changes to existing RLS on `notifications` (the RPC bypasses INSERT restrictions safely, and only for the caller's own manager chain).

### Out of scope

- Email or push delivery for notifications (in-app only).
- A dedicated `task_requests` table — reusing `notifications` with `kind='task_request'` keeps the surface small; the manager creates the actual task from `/tasks`.
- Changing the request routing logic per department beyond the resolution above.

### Files touched

- `supabase/migrations/…sql` (new)
- `src/routes/_authenticated/tasks-overview.tsx` — actions column + duplicate/delete handlers
- `src/routes/_authenticated/punch.tsx` — searchable task combobox + RequestTaskDialog
- `src/components/notifications-bell.tsx` (new)
- `src/components/top-bar.tsx` — mount the bell
- `src/lib/tasks-plus.functions.ts` — small `duplicateTask` server fn wrapping `create_task_full`