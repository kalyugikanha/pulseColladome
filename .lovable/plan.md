## Root cause

The `tasks` table has `department_id` (uuid FK to `taxonomy_departments`) — there is no plain `department` text column. Two inserts in `marketing-kanban.tsx` are trying to set `department: "Marketing"` / `department: target`, which PostgREST rejects with "Could not find the 'department' column".

## Fix

Edit `src/routes/_authenticated/marketing-kanban.tsx`:

1. **New Marketing task insert** (`NewMarketingTaskDialog.submit`, ~line 479): drop the `department: DEPT` field. Marketing membership is already carried by `marketing_stage`, which the Kanban queries filter on. To keep department-scoped views elsewhere consistent, also set `department_id` by looking up the Marketing row in `taxonomy_departments` once (cached with the existing `clients` query pattern) and setting `department_id: <uuid>` when found. If not found, just skip it — do not send the invalid text field.

2. **Crossover request insert** (`CrossoverDialog.submit`, ~line 606): replace `department: target` with `department_id`, resolved from the already-loaded `depts` query by matching `name === target`. Same fallback: skip when no match.

3. No schema change needed — `department_id` already exists.

## Verify

Create a new Marketing task and confirm it lands in the Script Writing column with no toast error. Then send a crossover request to another department and confirm the same.
