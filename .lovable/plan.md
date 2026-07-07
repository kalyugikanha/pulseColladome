## Filters (top of `/marketing-kanban`)

Add a filter bar above the columns:

- **Assignee** dropdown — Marketing roster only (same list already computed for the reassignment picker). Options: "All", "Unassigned", then each roster member. Persist in URL search param `?assignee=<uuid|all|unassigned>`.
- **Mine** toggle button ("My tasks") — shortcut for `assignee = me.realId`. Highlighted when active. When the signed-in user is in the Marketing roster it's the fast path; for non-Marketing viewers it just narrows the existing "My requests" strip logic.
- Filters compose with the existing "My requests" strip (strip stays for non-Marketing viewers).
- Client-side filter over the already-fetched `tasks` list — no new query.

## Hours logging on every move

The kanban stores stage in `tasks.marketing_stage` and today logs moves as `task_activity` rows (`kind: 'marketing_stage_moved'`). We keep that path and add explicit hours capture.

**Schema (migration, additive only — no drops):**
- `ALTER TABLE public.task_activity ADD COLUMN hours numeric(6,2)` (nullable so old rows stay valid).
- Also `ALTER TABLE public.task_stage_events ADD COLUMN hours numeric(6,2)` so the same convention works for multi-stage tasks going forward.
- Backfill: none — historical rows stay `NULL`.

**UI flow:**
- Reuse the existing "Confirm move" dialog (`pending` state). Add two fields:
  - **Hours spent** (numeric, step 0.25, required, min 0) — pre-filled with `""`.
  - **Note** (optional text, existing behavior preserved).
- On confirm, `commitMove` writes the `task_activity` row with `hours` set and the payload unchanged.
- Forward moves (drag between columns, Approve, Send to next) all funnel through this dialog so hours are always captured.

**Revision (send-back) flow:**
- The existing "Send back" dialog (`sendBack` state) now also requires **Reviewer hours** (hours spent reviewing) + note. Persisted as a `task_activity` row `kind: 'marketing_stage_sent_back'` with `hours` populated and the note logged as a comment (existing behavior).
- The next forward move by the owner captures their rework hours through the standard move dialog — that's how rework accumulates against burn.

**Gating unchanged:** only Marketing team / heads / admins can move or send back. Existing `isMarketingMember` check stays.

## Burn totals

Compute burn from `task_activity` rows for a task: `SUM(hours)` across `marketing_stage_moved` + `marketing_stage_sent_back`.

- **Kanban card:** small badge "⏱ 4.5h" next to priority when total > 0. Fetched via one aggregate query keyed by visible task IDs (`select task_id, sum(hours) group by task_id`) — one round-trip, cached with the kanban query key.
- **Task detail sheet:** new "Time log" section listing each entry (actor, from → to, hours, note, timestamp) with a total at the top. Read-only.

Detail sheet lives in `src/components/tasks/task-detail-sheet.tsx`; we add the section conditionally when the task has any `task_activity` rows with `hours IS NOT NULL`.

## Files touched

- New migration: add `hours` column to `task_activity` and `task_stage_events`.
- `src/routes/_authenticated/marketing-kanban.tsx` — filter bar, URL search param wiring, hours field in move + send-back dialogs, burn badge on cards, aggregate query.
- `src/components/tasks/task-detail-sheet.tsx` — Time log section.

## Out of scope

- No changes to BD, tasks in non-marketing views, or the general workflow engine beyond the additive column.
- No deletions or data rewrites.
