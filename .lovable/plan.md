## Goal
Ship the marketing-team task upgrade for Kanishka & team: richer task metadata, a self-expanding taxonomy (Domain → Department → Task Type), recurring templates, role/personal presets, and an admin overview grid.

## Data model (one migration)

### Taxonomy (self-expanding, admin-editable)
- `taxonomy_domains(id, name unique, sort, active, created_at, updated_at)`
- `taxonomy_departments(id, domain_id → domains, name, active, sort, unique(domain_id,name))`
- `taxonomy_task_types(id, department_id → departments nullable, name, active, is_custom bool, created_by, unique(department_id,name))`
  - `department_id NULL` = global type usable anywhere.
- `role_task_type_presets(id, role_key text, task_type_id)` — `role_key` = either an `app_role` value or a department name; used to default the dropdown per user.
- `user_task_presets(id, user_id, label, domain_id, department_id, task_type_id, use_count, updated_at)` — auto-updates on task create; top 5 by use_count render as chips.

All tables: GRANTs to `authenticated`/`service_role`; RLS with:
- Read: any authenticated user (needed for dropdowns everywhere).
- Insert on `taxonomy_task_types`: any authenticated user (self-expanding, `is_custom = true`, records `created_by`).
- Insert/update/delete on other taxonomy + presets: `private.is_admin()` OR `private.is_department_head()`.
- `user_task_presets`: owner-only CRUD.

### Task extensions (alter `public.tasks`)
- `asset_links jsonb NOT NULL DEFAULT '[]'::jsonb` — array of `{label, url}`.
- `domain_id uuid` → taxonomy_domains (nullable, ON DELETE SET NULL)
- `department_id uuid` → taxonomy_departments (nullable)
- `template_id uuid` → task_templates (nullable, for provenance)
- New junction `task_task_types(task_id, task_type_id, PK composite)` — multi-select tags per task. RLS: read/write if you can read/write the parent task (subquery on `tasks` policies).

### Recurring templates
- `task_templates(id, title, description, project_id nullable, domain_id, department_id, default_assignee_id, asset_links jsonb, recurrence enum('none','weekly','monthly'), day_of_month int nullable, weekday int nullable, priority task_priority, active bool, created_by, created_at, updated_at)`
- `task_template_task_types(template_id, task_type_id)` — matches multi-tag.
- Instantiation: server fn `generateTasksFromTemplate({templateId, dueDate})` — copies fields into a new task + junction rows. A follow-up can wire `pg_cron`; ship the manual "Generate now" + list view first.

## Server layer (`src/lib/taxonomy.functions.ts`, `src/lib/tasks.functions.ts` additions)
- `listTaxonomy()` — returns `{domains, departments, taskTypes}` for dropdown wiring, cached via TanStack Query.
- `createCustomTaskType({name, departmentId})` — inserts with `is_custom=true`.
- `upsertUserPreset({domainId, departmentId, taskTypeId, label})` — called after task create; increments `use_count`.
- `listUserPresets()` — top 5 for chips.
- `listRolePresets({roleKey})` — for defaulting.
- `createTask` / `updateTask` extended to accept `assetLinks`, `domainId`, `departmentId`, `taskTypeIds[]`, writes junction.
- `listTasksOverview({filters})` — dept-head + admin grid feed with joins for names.
- `createTemplate`, `updateTemplate`, `listTemplates`, `generateFromTemplate`, `deleteTemplate`.
- Admin taxonomy CRUD: `createDomain/updateDomain/deleteDomain` etc., `setRolePresets`.

All new mutations: `requireSupabaseAuth` + role check where applicable.

## UI

### Task create/edit dialog (existing task form)
- **Asset links** repeater: label + URL rows, auto-detect Drive/Canva/Figma with icons.
- **Cascading dropdowns**: Domain → Department → Task Type (each disabled until parent chosen; last one loads department-scoped + global types). "+ Add custom type" inline input.
- **Multi-select task types** chip picker (backed by junction).
- **Personal presets chip row** at the top of the dialog (one click fills Domain/Dept/Type).
- **Role default**: on open, if all three empty, pre-fill from `role_task_type_presets` for user's role/department.

### New route `/_authenticated/task-templates` (dept head + admin)
- List active templates, filters by dept.
- Create/edit form (same field set as task + recurrence).
- "Generate now" and preview next run.

### New route `/_authenticated/tasks-overview` (dept head + admin)
- Full-width grid: assignee, project, domain, department, task types, priority, status, due, asset link count.
- Filters: employee (multi), department (multi), project (multi), date range, status. Dept heads default-filtered to their departments; admins see all.
- Column sorting, CSV export.

### New route `/_authenticated/admin/taxonomy` (super admin only)
- Three-column manager (Domains / Departments / Task Types) — add/rename/deactivate. Selecting a domain scopes the department list; selecting a department scopes types.
- Role presets tab: pick role/department → attach default task types.
- Hide/show custom types (badge for `is_custom`).

### Sidebar
- Add "Templates" (dept head+) and "Task Overview" (dept head+) under Tasks; "Taxonomy" under Access (super admin only).

## Migration/backfill
- Seed domains: `Colladome`, `Client Work` (renamable).
- Seed departments per domain from existing `profiles.department` distinct values (Marketing, Video, Design, Content, Operations, Tech, etc.) — nested under Colladome by default.
- Seed initial task types: `Video Editing`, `Scripting`, `Raw Cut`, `Content Writing`, `Posting`, `Scheduling`, `Designing`, `Graphics`, `Motion Graphics`, `Strategy`, `Research`, `Client Meeting`. Attach to matching departments.
- Seed role presets for Designer/Video Editor/Content roles.

## Out of scope (call out explicitly)
- Automated recurrence via `pg_cron` — templates ship with manual "Generate now"; scheduling is a follow-up so we can watch behavior first.
- Attachments file upload — asset links only (Drive/Canva URLs), matching the request.
- No changes to salaries/vendor payments/finance surfaces.

## Verification
1. `/tasks` — creating a task shows Domain→Dept→Type cascade, asset link rows, multi-tag chips, personal preset chips. Custom type creation from the field works.
2. `/task-templates` — Kanishka creates a "Monthly Newsletter" template and clicks "Generate now" → task appears in the overview grid.
3. `/tasks-overview` — Kanishka sees all Marketing tasks, filters by employee and date. Admin sees all departments.
4. `/admin/taxonomy` — super admin renames a department; change flows into every dropdown.
5. Non-manager employee only sees their own presets + task types; role default pre-fills correctly.

Total: 1 migration, ~2 new server-fn files, 3 new route files, edits to task dialog + sidebar. Ready to build on approval.