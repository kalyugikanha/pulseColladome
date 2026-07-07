## Goal
Merge four sidebar entries — **HR Leaves**, **Onboarding Approvals**, **Onboarding**, and **Access & Roles** — into a single **HR Admin** tab with sub-tabs.

## Changes

### 1. New route `src/routes/_authenticated/hr-admin.tsx`
- Guarded to `isSuperAdmin || isHrAdmin` (same as existing routes).
- Uses shadcn `Tabs` with 4 tabs:
  1. Leaves
  2. Onboarding Approvals
  3. Onboarding
  4. Access & Roles
- Active tab synced to URL via search param `?tab=leaves|approvals|onboarding|access` (default `leaves`) so deep-links and sidebar re-clicks land in the right place.
- Renders the existing page components inline (imported from their current files).

### 2. Export page components from existing route files
In each of these files, export the inner component so `hr-admin.tsx` can render it without duplicating logic:
- `src/routes/_authenticated/hr.leave.tsx` → `export function HrLeavePage()`
- `src/routes/_authenticated/hr.onboarding.tsx` → `export function HrOnboardingPage()`
- `src/routes/_authenticated/onboarding.tsx` → `export function OnboardingPage()`
- `src/routes/_authenticated/access.tsx` → `export function AccessPage()`

The original routes remain (so existing bookmarks/links keep working) but each becomes a thin redirect to `/hr-admin?tab=<x>` — set via `Route`'s `beforeLoad` `throw redirect(...)`. This keeps one source of truth for the UI.

### 3. Sidebar (`src/routes/_authenticated/route.tsx`)
Replace the four separate `SidebarMenuItem` blocks (HR Leaves, Onboarding approvals, Onboarding, Access & Roles) with a single **HR Admin** item linking to `/hr-admin`, active when `pathname.startsWith("/hr-admin")`. Pick one icon (Shield or ClipboardCheck).

## Out of scope
- No changes to underlying data, RLS, mutations, or feature behavior inside the four panels.
- `/complete-onboarding` and `/onboarding-pending` (employee-facing flows) untouched.
- No visual redesign of the individual panels beyond wrapping them in tabs.
