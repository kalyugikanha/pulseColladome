## Goal
Make the Department field in the onboarding module a dropdown fed by the existing taxonomy departments instead of a free-text input.

## Scope
Frontend only. No schema, RLS, or backend changes. `profiles.department` stays a string; we just constrain the UI to values from `taxonomy_departments` (already fetched via `getTaxonomy` in `src/lib/tasks-plus.functions.ts`).

## Files to change
1. `src/routes/_authenticated/onboarding.tsx`
   - Create panel (line ~191): replace the free-text `<Input>` for Department with a shadcn `<Select>` populated from `getTaxonomy().departments` (grouped/labeled by domain for readability). Store the department **name** (to remain compatible with existing string column and existing rows).
   - Edit sheet (line ~347): same replacement inside the edit dialog.
   - Add a "Clear" / empty option so a user can unset the department.

2. `src/routes/_authenticated/complete-onboarding.tsx`
   - Line ~413 ("Job department *"): replace the `<Input>` with the same `<Select>` sourced from taxonomy departments. Keep it required.

## Data source
Reuse existing `getTaxonomy` server fn via TanStack Query (same pattern as `taxonomy-picker.tsx`). No new endpoint.

## Behavior
- Options list = all active departments across domains, sorted by domain then name; label shown as `"<Domain> — <Department>"` for disambiguation. Value stored = department name string (matches current column semantics and preserves legacy rows).
- If a profile already has a department string that isn't in the list, show it as a disabled current-value option so it isn't silently dropped on edit.
- HR view (`hr.onboarding.tsx`) unchanged (read-only display already works with strings).

## Out of scope
- Migrating `profiles.department` to a FK.
- Editing taxonomy from the onboarding screens (still done in Admin > Taxonomy).
- Changes to workflows / board / directory department usage.
