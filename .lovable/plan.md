## Marketing Kanban — details, comments, and access rules

### 1. Card detail + comments
- Clicking a card opens the existing `TaskDetailSheet` (`src/components/tasks/task-detail-sheet.tsx`), which already renders the full task view with the comments section, subtasks, activity, watchers, and dependencies.
- Wire it in `marketing-kanban.tsx`:
  - Add `const [openTaskId, setOpenTaskId] = useState<string | null>(null);`
  - Render `<TaskDetailSheet taskId={openTaskId} onClose={() => { setOpenTaskId(null); qc.invalidateQueries({ queryKey: ["mkt-kanban"] }); }} />`.
  - On the card body, add `onClick={() => setOpenTaskId(t.id)}` (with `stopPropagation` around drag/link elements — the existing asset-link and Approve/Send-back buttons already stop propagation).

### 2. Moves — anyone, any bucket → any bucket
- Remove the two restrictions in `onDragEnd`:
  - `if (t.marketing_stage === "posted") …` (Posted lock) — delete.
  - `if (t.marketing_stage === "review" && overId !== "review") …` (Review exit lock) — delete.
- Keep the reassign popup on every move (per your choice) and keep the Approve / Send-back buttons on Review cards as convenience shortcuts.
- Keep the current `patch.status` mapping so board moves stay coherent with the generic task views.

### 3. Access: Marketing kanban visible to everyone; BD tasks BD-only
Two RLS changes on `public.tasks` (single migration):

**a. Open marketing kanban rows to all authenticated users.** Add a SELECT policy so any signed-in user can read tasks that live on the marketing board:

```sql
CREATE POLICY "tasks: marketing kanban read all" ON public.tasks
  FOR SELECT TO authenticated
  USING (marketing_stage IS NOT NULL);
```

This lets non-Marketing folks see the board and open card details, without widening access to unrelated task rows.

**b. Restrict Business Development tasks to the BD team.** BD = tasks whose `department_id` matches the `Business Development` row in `taxonomy_departments`. Add a helper + gate every existing task SELECT policy so BD rows are only visible to BD team members, BD head, super/HR admins, and project managers.

Approach:

```sql
-- Helper: is the given user on the BD team?
CREATE OR REPLACE FUNCTION private.is_bd_team(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _uid AND lower(p.department) = 'business development'
  )
  OR EXISTS (
    SELECT 1 FROM public.department_heads dh
    WHERE dh.user_id = _uid AND lower(dh.department) = 'business development'
  );
$$;

-- Helper: is this task a BD task?
CREATE OR REPLACE FUNCTION private.is_bd_task(_task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.taxonomy_departments d ON d.id = t.department_id
    WHERE t.id = _task_id AND lower(d.name) = 'business development'
  );
$$;
```

Then guard the existing SELECT policies (`tasks: read involved or manager`, `tasks: reviewer read`, `tasks: reporting manager read`, `tasks: dept head read`, and the new `tasks: marketing kanban read all`) by ANDing:

```sql
AND (
  NOT private.is_bd_task(id)
  OR private.is_bd_team(auth.uid())
  OR private.is_admin(auth.uid())
  OR private.is_super_admin(auth.uid())
  OR private.is_hr_admin(auth.uid())
  OR private.can_manage_projects(auth.uid())
)
```

Each affected policy is dropped and recreated with the BD guard appended. Manage/write policies stay as-is (creators/managers already control writes).

### 4. Verify
- As a non-Marketing user (e.g., Design/Ops): open `/marketing-kanban`, cards load, card click opens detail + comments, drag between any columns works.
- As Marketing head/admin: same, plus reassign dialog + approve/send-back still work.
- Create a BD-department task via `/tasks` → confirm it is invisible to a non-BD user, visible to a BD member.
- Confirm existing Marketing kanban BD-related requests (if any were created through cross-department flow into BD) are hidden from non-BD viewers.

### Files touched
- `src/routes/_authenticated/marketing-kanban.tsx` — add detail-sheet wiring, remove two move restrictions.
- New migration `supabase/migrations/…_marketing_kanban_access.sql` — helpers + policy rewrites.
