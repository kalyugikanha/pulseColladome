## Problem

`task_ratings` has **zero rows** in the database — no ratings have ever been recorded. Root causes:

1. **The only rating input in the whole app** is inside the Review dialog's "Approve" action (`workflow-task-panel.tsx` → `ReviewDialog`). It never appears on tasks the user closes directly, on tasks that don't have a review stage, or as a standalone action on a done task. So a manager who thinks they "gave a rating on each task" actually never had a place to submit one for most tasks.
2. `reviewTask` inserts the rating without checking the returned error, so RLS rejections (e.g. rater is neither reviewer nor creator) fail silently. If the rare Review-Approve rating path is used but the RLS policy denies it, the user sees "Approved" and nothing more.
3. Performance page reads `task_ratings` correctly — it isn't the bug; there's just nothing to show.

## Changes

### 1. Standalone rating widget on the task detail
`src/components/tasks/task-detail-sheet.tsx`:
- Add a compact "Rate this work" star row (1–5, clickable, with existing rating pre-filled) visible whenever `actingUserId` is one of: task reviewer, task creator, or the assignee's reporting manager — **and** `actingUserId !== assignee_id` — regardless of task status. Reviewer-agnostic so Kanishka can rate any of Sweksha's tasks she owns/manages without going through a review dialog.
- Fetch the current rating alongside task detail (extend `getTaskDetail` to also return `myRating` — most recent rating by actingUser on this task).
- Clicking a star calls a new server fn `rateTask({ taskId, rating })`; the widget updates optimistically and toasts on save.

### 2. New `rateTask` server function
`src/lib/tasks-workflow.functions.ts`:
- `createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])` accepting `{ taskId, rating: 1..5, viewAsUserId? }`.
- Loads the task, resolves acting user via `resolveActingUser`, verifies acting user is reviewer / creator / reporting manager of the assignee and is **not** the assignee.
- Upserts into `task_ratings` (delete existing rows by same `rater_id` on the same `task_id`, then insert new one — or use a proper `on conflict` if a unique index exists). Checks `error` and throws on failure so the client sees the real reason.
- Also fix the silent insert in existing `reviewTask` (`workflows.functions.ts` line 334) to check `error` and throw.

### 3. RLS on `task_ratings`
Migration to update the INSERT policy so it accepts creator, reviewer, or the assignee's reporting manager as the rater, and to enforce `rater_id != ratee_id`. Add matching UPDATE and DELETE policies scoped to the same rater set so a rater can revise or clear their own rating:

```sql
DROP POLICY IF EXISTS "Reviewer can rate a task" ON public.task_ratings;

CREATE POLICY "Authorised raters can rate a task"
  ON public.task_ratings FOR INSERT TO authenticated
  WITH CHECK (
    rater_id = auth.uid()
    AND rater_id <> ratee_id
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      LEFT JOIN public.profiles p ON p.id = t.assignee_id
      WHERE t.id = task_ratings.task_id
        AND t.assignee_id = task_ratings.ratee_id
        AND (
          t.reviewer_id = auth.uid()
          OR t.created_by = auth.uid()
          OR p.reporting_manager_id = auth.uid()
        )
    )
  );

CREATE POLICY "Raters can update own rating"
  ON public.task_ratings FOR UPDATE TO authenticated
  USING (rater_id = auth.uid()) WITH CHECK (rater_id = auth.uid());

CREATE POLICY "Raters can delete own rating"
  ON public.task_ratings FOR DELETE TO authenticated
  USING (rater_id = auth.uid());
```

SELECT policies stay as-is (ratee sees their own; super-admins see all). Add a policy so the rater can also see their own submissions, since the widget re-reads.

### 4. Keep the existing review-dialog rating
No UI removal — the Approve dialog's stars still work; they now route through the same fixed insert path (with error surfacing).

## Verify

- As Kanishka on a task assigned to Sweksha (Kanishka = creator/reviewer/manager), open the task: star row appears, clicking 4 stars persists a row in `task_ratings` with `rater_id=Kanishka, ratee_id=Sweksha, rating=4`.
- As Sweksha on her own task: no star row shown.
- As Sweksha on Performance page for the current month: "Average rating this month" reflects the new rating.
- Re-click a different star as Kanishka: the row updates (old one replaced), average shows the new value.
- Approve flow in Review dialog with a rating still writes correctly; RLS rejection now surfaces as a toast instead of silent success.
