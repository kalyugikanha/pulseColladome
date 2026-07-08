# Per-section onboarding: required flag + approval per section

## What changes at a glance

Today: one `profiles.onboarding_required` toggle + one big Submit → HR approves the whole thing.

New: seven independent sections, each with its own **Required** flag (HR/Super Admin controls) and its own **Status** (`draft` → `submitted` → `approved` | `rejected`). HR approves them one at a time. Portal unlocks only when every required section is approved.

Sections (fixed list, enum in the DB):
1. `personal` — Personal details
2. `work` — Work preferences (department, day start, standup, joined_on, employment)
3. `bank` — Bank details
4. `documents` — Identity/education docs (Aadhar, PAN, offer, cheque, marksheets, resume, profile pic)
5. `follow` — Follow Colladome screenshots
6. `reviews` — Review screenshots (Google, Glassdoor, AmbitionBox)
7. `linkedin_employment` — LinkedIn "Works at Colladome" proof

## Database (single migration)

- `CREATE TYPE public.onboarding_section AS ENUM (...7 values...)`
- `CREATE TYPE public.onboarding_section_status AS ENUM ('draft','submitted','approved','rejected')`
- `CREATE TABLE public.onboarding_section_state (user_id uuid → auth.users, section onboarding_section, required boolean DEFAULT true, status ... DEFAULT 'draft', submitted_at, approved_at, approved_by, rejected_at, rejection_reason, updated_at, PRIMARY KEY(user_id, section))`
- GRANTs to authenticated + service_role; RLS:
  - user can `SELECT` own rows;
  - user can `UPDATE` own row **only** to move `draft`→`submitted` (via `WITH CHECK`);
  - HR admin + super admin can select/update all rows (via `private.is_hr_admin` / `private.is_super_admin`).
- Trigger on `profiles` insert → seed 7 rows for the new user, `required` copied from `profiles.onboarding_required` (all true by default).
- Backfill: for every existing profile insert 7 rows. If `onboarding_completed = true`, set every row's status = `approved` with `approved_at = onboarding_completed_at`. Otherwise `status = 'draft'`, `required = onboarding_required`.
- SQL helper `public.user_onboarding_gate(_uid uuid) returns boolean` → true when the user is blocked (any required section is not `approved`).

Existing `profiles.onboarding_required / _submitted_at / _approved_at / _rejected_at / _rejection_reason` are kept for backwards compatibility during rollout but no longer drive the gate. `approveOnboarding`/`rejectOnboarding` will be removed once the new flow ships.

## Server functions

**`src/lib/onboarding.functions.ts`** — extend:
- `getMyOnboarding` also returns `sections: { section, required, status, submitted_at, approved_at, rejected_at, rejection_reason }[]`.
- `submitOnboardingSection({ section })` — validates that section's specific completeness (per-section required fields / docs), then moves that row to `submitted`. Replaces `completeMyOnboarding`.
- Keep `saveMyOnboarding` and `recordMyDocument` unchanged; but if a section is currently `approved` and its data changes, auto-reset that section back to `draft` (so HR re-reviews). Rejected sections stay editable; on re-submit they go back to `submitted`.

**`src/lib/onboarding-approvals.functions.ts`** — replace whole-submission fns with:
- `listOnboardingSectionSubmissions({ status })` — returns rows joined with profiles, one row per pending/rejected/approved (section, user).
- `approveOnboardingSection({ user_id, section })` — HR/super only.
- `rejectOnboardingSection({ user_id, section, reason })` — HR/super only.
- On approve of the `follow` section, run the existing "welcome post" side-effect (currently in `approveOnboarding`), but only fire once per user (idempotent on task title, as today).

**`src/lib/admin-users.functions.ts`** (or new fn in onboarding-approvals) — `setOnboardingSectionRequired({ user_id, section, required })`. HR/super only. Setting `required=true` on an already-approved section also flips status back to `draft` so the user re-submits.

## UI

**`src/hooks/use-current-user.ts`** — add `onboardingGateBlocked: boolean` computed from the new sections (any required && not-approved). Keep the old fields but stop using them for routing.

**`src/routes/_authenticated/route.tsx`** — swap the redirect condition from `user.onboardingRequired && !user.onboardingApprovedAt` to `user.onboardingGateBlocked`. Same redirect targets:
- If any required section is `draft` → `/complete-onboarding`.
- If all required sections are `submitted` (nothing left to fill) → `/onboarding-pending`.

**`src/routes/_authenticated/complete-onboarding.tsx`** — restructure into 7 clearly separated section cards. Each card:
- Header with title, a status pill (Draft / Submitted / Approved / Sent back), and (when rejected) the HR reason.
- Body: the fields/docs that already exist, reused.
- Footer: "Submit for approval" button, enabled once that section's completeness check passes. Disabled while `submitted` or `approved` (with re-submit if edits happened after approval).
- Overall progress bar becomes "N of M sections approved".

**`src/routes/_authenticated/hr.onboarding.tsx`** — rebuild the list:
- One row per employee showing 7 small pills (color-coded status per section) + counts. Filter tabs: Any pending / Any rejected / All approved.
- Clicking a row opens a Sheet with 7 collapsible section blocks; each block shows the read-only submitted content + docs (reusing the current review panels), a per-section **Approve** button and a **Send back with reason** action. Header shows overall counts.
- Reuse existing `getEmployeeOnboarding`/`getEmployeeDocumentUrl` to show data + signed URLs.

**`src/routes/_authenticated/directory.tsx`** — replace the single "Onboarding required" checkbox in the row/edit dialog with a popover listing 7 checkboxes (one per section) driven by `setOnboardingSectionRequired`. Column becomes a compact "3/7 required" chip.

**`src/components/directory/employee-profile-sheet.tsx`** (already exists from prior turn) — surface the 7-section status strip near the top so a super admin can see approval state at a glance.

## Migration order

1. Migration (schema + backfill).
2. Regenerated Supabase types (auto).
3. Server-fn edits + hook + gate change + UI.
4. Remove the now-unused whole-submission `approveOnboarding`/`rejectOnboarding` and the single `onboarding_required` UI once the new flow is verified.

## Out of scope
- Reordering / customizing which sections exist per user.
- Per-field approval (only per-section).
- Notifying employees on approval/rejection beyond in-app UI (no email).
