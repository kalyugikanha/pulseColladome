## Part 1 — Default every section to "not required"; surface HR-marked sections first

Right now every new profile gets all 7 sections seeded with `required = true`. Employees are blocked until HR approves everything. Flip the default so nothing is required until HR explicitly turns it on.

### Migration
- Change the `seed_onboarding_sections` trigger: `_required := false` (was `COALESCE(NEW.onboarding_required, true)`). New employees start with all 7 sections as `required = false`, `status = draft` → portal is unblocked by default.
- Backfill existing rows: `UPDATE public.onboarding_section_state SET required = false WHERE status <> 'approved'`. Already-approved rows keep `required` as-is so the historical record stays intact.
- No DB-level default change beyond the trigger; the column default stays `true` but the trigger overrides it.

### Employee page (`src/routes/_authenticated/complete-onboarding.tsx`)
- Sort sections into two groups: **Required by HR** (rendered first, in the canonical order), then **Optional** (rendered below, muted and collapsed by default with a "Show" toggle).
- Each required card gets a small orange "Required by HR" tag next to the section title so it's unambiguous.
- Optional cards keep the existing "Not required" grey badge; Submit button is hidden on optional cards (users can still save their info via auto-save).
- Banner logic already prefers rejected → submitted → approved → newly-required; unchanged, but the "Please complete these sections" case now lists only HR-required sections in draft.

### Hook (`src/hooks/use-current-user.ts`)
- No code change needed — `onboardingGateBlocked` already keys off `required && status !== 'approved'`. With all rows starting `required=false`, no employee is auto-blocked until HR turns on a section.

## Part 2 — Impersonation shows the full employee onboarding view

When a super admin picks a user via "View as", `/complete-onboarding` currently still shows the super admin's own record because `getMyOnboarding` uses `context.userId` (the real signed-in user). Impersonation only shifts the frontend; it doesn't rewrite server-fn identity.

### New server function (`src/lib/onboarding.functions.ts`)
- Add `getOnboardingForUser({ user_id })`:
  - `.middleware([requireSupabaseAuth])`
  - If `user_id === context.userId` → same code path as `getMyOnboarding`.
  - Else assert caller is a super admin (existing `super_admins` check pattern; HR admin also allowed, matching `getEmployeeOnboarding`). Load target user's profile, bank, documents, and section state via `supabaseAdmin` so RLS doesn't hide fields.
  - Returns the same shape `getMyOnboarding` returns today.

### Employee page (`complete-onboarding.tsx`)
- Read `viewingAs` and `me.id` from `useCurrentUser`.
- Replace `getMyOnboarding` with `getOnboardingForUser({ user_id: me.id })` and add `me.id` to the query key so the page swaps correctly on impersonation toggle.
- When `viewingAs === true`:
  - Show a top banner: "Viewing as <name> — read-only. Use HR › Onboarding Approvals to make changes."
  - Disable all field inputs, all upload buttons, all "Submit for approval" and "Save progress" buttons (auto-save also skipped — early-return in the debounced effect when `viewingAs`).
  - Section pills, banner, and status timestamps render normally so the super admin sees exactly what the employee sees.

## Technical notes
- No RLS or GRANT changes: `getOnboardingForUser` uses `supabaseAdmin` in the cross-user branch and authorizes via the existing super/HR check.
- No new tables or enums.
- The Directory-side super-admin "Profile" sheet already handles cross-user editing; impersonation view stays read-only to avoid two write paths for the same data.
- Backfill runs once; safe to re-run (idempotent — only touches non-approved rows).

## Out of scope
- Editing employee data through impersonation (already covered by the Super Admin profile sheet on `/directory`).
- Changing the historical `required=true` on already-approved rows.
- Notifications about "HR turned on a section" — already handled by the previous change.
