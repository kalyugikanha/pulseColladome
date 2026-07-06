## Goal
Support two compensation types per employee in Finances: **fixed monthly salary** (current behavior) or **hourly rate card** (e.g. Arpit @ ₹400/hr). Admin can pick the type when setting comp, and monthly cost + project burn compute correctly for both.

## Schema change (single migration)
Extend `public.salaries`:
- `comp_type text NOT NULL DEFAULT 'monthly'` with CHECK in `('monthly','hourly')`
- `hourly_rate numeric(12,2)` (nullable)
- Drop the existing `monthly_salary >= 0` NOT NULL requirement — make `monthly_salary` nullable
- Add row-level CHECK: if `comp_type='monthly'` then `monthly_salary` required; if `hourly` then `hourly_rate` required

(existing RLS/grants unchanged)

## Finances page changes (`src/routes/_authenticated/finances.tsx`)

**SalaryDialog** — add a "Compensation type" radio (Monthly / Hourly). Show either "Monthly salary (INR)" or "Hourly rate (INR/hr)" input accordingly. Insert row with appropriate fields.

**Salaries table** — replace "Monthly salary" column with two:
- `Type` (badge: Monthly / Hourly)
- `Rate` (₹X/month or ₹Y/hr)

**Burn calculation** — update `burnByProject`:
- For monthly-comp users: current salary-share allocation (unchanged).
- For hourly-comp users: `burn = hours_on_project × hourly_rate` (direct, no share math).

**Configured pool stat** — for hourly users, contribute `hourly_rate × hours_logged_this_month` (or omit from "pool" since it's variable; label clarified).

## Roster seeding
Update `TEAM_ROSTER` in `src/lib/admin-users.functions.ts` so Arpit (`arpit@colladome.in`) gets `comp_type: 'hourly'`, `hourly_rate: 400`. `bulkProvisionTeam` writes those fields into `role_grants` + `salaries`. Extend `role_grants` similarly (add `comp_type`, `hourly_rate` cols) so invited-but-unregistered hourly users display correctly.

## Files
- new migration: extend `salaries` + `role_grants`
- `src/routes/_authenticated/finances.tsx` — dialog, table, burn math
- `src/lib/admin-users.functions.ts` — TEAM_ROSTER + upserts

## Out of scope
Timesheet approval flow, invoicing, retroactive rate history UI (rows are already time-versioned via `effective_from`).
