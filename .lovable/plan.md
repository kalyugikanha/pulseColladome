## Give reporting managers access to Workflows

**Problem**: Kanishka, Akash, and anyone else with ≥1 direct report see the Workflows link in the sidebar and pass the database RLS checks, but the `/workflows` page itself hard-blocks them with an "Admins only" message.

**Root cause**: `src/routes/_authenticated/workflows.tsx:34`
```ts
if (!me?.isAdmin && !me?.isSuperAdmin) return <div className="p-8 text-muted-foreground">Admins only.</div>;
```
This gate is stricter than the sidebar (which already checks `isReportingManager`) and stricter than the RLS policies on `workflow_templates` / `workflow_template_stages` / `workflow_instances`, which already grant read+write to `private.has_direct_reports(auth.uid())`.

### Change (single file, additive)
- `src/routes/_authenticated/workflows.tsx` — widen the gate to also allow reporting managers:
  ```ts
  if (!me?.isAdmin && !me?.isSuperAdmin && !me?.isReportingManager)
    return <div className="p-8 text-muted-foreground">Access restricted.</div>;
  ```

### Not touched
- No RLS / migration changes — DB already permits reporting managers.
- No sidebar changes — already correct.
- No changes to `workflows.functions.ts` — server fns rely on RLS, which is already permissive for managers.
- HR admins, finance admins, department heads: unchanged (not in scope of this request; can be added later if needed).

### Verification
- Sign in as Kanishka or Akash → click Workflows → the templates list renders instead of "Admins only."
- Non-manager, non-admin employee → still sees the restricted message and no sidebar link.
