# Fix: Team timesheet crash inside Attendance hub

## Root cause

`src/routes/_authenticated/timesheet.tsx` calls `useSearch()` bound to the `/_authenticated/timesheet` route. When `TimesheetPage` is rendered as a tab inside `/attendance`, that route is not the active match, so TanStack throws:

> Invariant failed: Could not find an active match from "/_authenticated/timesheet"

Same latent risk exists in every other panel we now render outside its own route (`PunchPage`, `MyTimesheetPage`, `LeavePage`, `CalendarPage`, `DirectoryPage`, `TaxonomyPage`) if any of them read `Route.useSearch` / `Route.useParams` / `Route.useLoaderData`. `timesheet.tsx` is the confirmed offender; I'll audit the others while fixing.

## Fix

1. In `timesheet.tsx`, replace the route-bound `useSearch()` call at line ~48 with a route-agnostic read:
   - `useSearch({ strict: false })` (returns partial/unknown, safe under any parent route), or
   - `useRouterState({ select: (s) => s.location.search })` and cast.
2. Grep the other extracted panels for `Route.use*` / `useSearch({ from: … })` / `useParams({ from: … })` / `useLoaderData({ from: … })`. Apply the same `strict: false` swap wherever they exist.
3. Reload `/attendance?tab=team-timesheet` — panel renders without the invariant error.

No schema or permission changes; no other files touched.
