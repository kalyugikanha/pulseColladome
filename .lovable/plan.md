## Goal
1. Let super admins pick a **department** when they create an account or grant a role on `/access`, and show departments in the current-grants list.
2. Add a **Department filter** on the admin analytics pages that list many people (Timesheet, Project Burn, Hours Editor, Finances), and add a **Project filter** on Timesheet (Project Burn already has one).

## Where "departments" come from
There's no fixed department table — `profiles.department` is free text seeded by `role_grants.department` on first sign-in and editable from onboarding/profile. Filters will populate their options from the distinct set of `department` values present in the loaded profiles for that page, plus an "Unassigned" bucket for rows with no department. No new tables.

## Changes

### 1. `/access` — add Department to both forms and show it in the list
`src/routes/_authenticated/access.tsx`
- **Create account** card: add a "Department" input (free text, with a `<datalist>` of existing departments pulled from `profiles`). Pass it as `department` in `createTeamUser({ data: ... })`.
- **Grant a role** card: add a "Department" input with the same datalist. Include `department` in the `role_grants` upsert (`department` column already exists).
- **Current grants** list: show a department badge next to the role badge when set. Order the list by department, then email.

`src/lib/admin-users.functions.ts`
- In `createTeamUser`, include `department: data.department ?? null` in the `role_grants` upsert (currently only writes to profiles after user creation). This makes department persist even for grants that never trigger user creation, and matches the `bulkProvisionTeam` behavior.

No new server functions and no migration — `role_grants.department` and `profiles.department` already exist.

### 2. Shared UI helper — `DepartmentFilter`
New file `src/components/department-filter.tsx`: a multi-select popover (checkbox list) built from the existing `Popover` + `Checkbox` primitives.
- Props: `departments: string[]`, `selected: Set<string>`, `onChange(next: Set<string>): void`, optional `includeUnassigned?: boolean` (default true).
- UI: button showing "All departments" or "N selected" / the single name; popover with a search input, "All" / "None" quick actions, checkbox per department, and an "Unassigned" row when enabled.
- Empty selection = no filter (show everyone).

### 3. Wire the filter into admin views

#### `src/routes/_authenticated/timesheet.tsx`
- Add `DepartmentFilter` next to the existing month picker. Filter the pivoted `users` array by `profile.department` (treat missing as "Unassigned").
- Add a **Project filter** (reuse the same multi-select pattern for `projects`) that hides non-selected project columns (and their totals). Empty = all projects.
- CSV export respects both filters.

#### `src/routes/_authenticated/project-burn.tsx`
- Add `DepartmentFilter` beside the existing project single-select. Filter `dailyRows`, `byProject`, and the trend data by `profileById.get(user_id)?.department`.
- Update the header count line to reflect filtered totals.

#### `src/routes/_authenticated/hours-editor.tsx`
- Add `DepartmentFilter` above the employees table. Filter the sorted `Profile[]` rows before rendering.

#### `src/routes/_authenticated/finances.tsx`
- Load `department` alongside `id, full_name, email` in the `finances-profiles` query.
- Add `DepartmentFilter` above the roster table; filter the rendered rows. Roll-up stat cards keep counting the full roster (unchanged) — the filter only affects the visible list.

### Out of scope
- No filter on `/punch`, `/tasks`, `/leave`, `/dashboard` — those are personal views, not multi-user rosters.
- No structured "departments" table or admin CRUD screen — departments remain free text, matching the current model. Colors on `/calendar` continue to come from `department_settings`.
- No changes to RLS or migrations.

## Verification
1. On `/access`, create a test grant with a new department "QA"; refresh → the "QA" tag appears in Current grants, and the datalist offers "QA" next time.
2. On `/timesheet`, pick month, select department "Marketing" → only Marketing employees rows shown; select projects → columns narrow; CSV matches.
3. On `/project-burn`, pick a department → burn stats and daily table restrict to that department's contributions; combined with an existing project filter still works.
4. On `/hours-editor` and `/finances`, department filter narrows the visible employee rows; clearing selection restores full list.
