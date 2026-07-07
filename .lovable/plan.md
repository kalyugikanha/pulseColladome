## Cause

There are two `public.create_task_full` overloads in the DB — one with `_estimated_hours` and one without. Postgres can't pick between them when the client omits `_estimated_hours`.

## Fix

Drop the older overload (the 10-arg version without `_estimated_hours`) so only the newer 11-arg function remains. The client already calls without `_estimated_hours`, which will resolve unambiguously to the remaining function (the parameter has a default of `NULL`).

### Migration
```sql
DROP FUNCTION IF EXISTS public.create_task_full(
  uuid, text, text, date, public.task_priority, uuid, jsonb, uuid, uuid, uuid[]
);
```

No app-code changes needed.