## Restore Data-API GRANTs on attendance tables

Both `public.attendance_logs` and `public.punch_sessions` currently have no GRANTs to `authenticated` / `service_role`, so PostgREST rejects every request — including punch-in inserts — with a permission error. RLS is fine; only the grants are missing.

### Migration

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.punch_sessions TO authenticated;
GRANT ALL ON public.punch_sessions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_logs TO authenticated;
GRANT ALL ON public.attendance_logs TO service_role;
```

No `anon` grants — both tables are auth-scoped.

### Verify

- Re-query `information_schema.role_table_grants` to confirm the rows exist.
- Have a signed-in user hit Punch In → row appears in `punch_sessions` and `attendance_logs`.
