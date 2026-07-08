## Goal

Close the loop on section-by-section onboarding: HR clearly sees what's approved, employees are told when something is approved / sent back / newly required, and HR can flip Required on/off without leaving the review sheet.

## 1. HR review sheet — make status obvious and add Required toggle

File: `src/routes/_authenticated/hr.onboarding.tsx`

- In each section card header, when status is `approved`:
  - Replace the "Approve" primary button with a solid green "Approved ✓" badge plus a subtle "Reset to draft" ghost action (asks user to re-submit).
  - Keep "Approved on <date> by <HR name>" caption.
- Add a **Required** switch on every section card (top-right, next to the status pill). Wired to existing `setOnboardingSectionRequired` server fn. Turning it OFF makes the card collapse to a compact "Not required" state; turning it ON while status was `approved` shows an inline note "This section will be reset to draft for the employee to re-submit."
- Add a summary strip at the top of the sheet: "X of Y required sections approved" with a green tick when fully approved.
- After Approve / Send back / Required-toggle, keep the sheet open and refetch (already done) — but also flash a small inline confirmation ("Approved. Employee has been notified.") on that card for 3s so HR sees the action landed.

## 2. Notify the employee on every event

Add in-app notifications (existing `notifications` table + bell) AND a banner on the employee's onboarding page.

### Server side
File: `src/lib/onboarding-approvals.functions.ts`

In `approveOnboardingSection`, `rejectOnboardingSection`, and `setOnboardingSectionRequired` (when it flips a section from not-required → required, or resets an approved one), insert a `notifications` row for `data.user_id`:

- kind: `onboarding_approved` | `onboarding_rejected` | `onboarding_required`
- body: human copy including the section label ("Personal details was approved.", "Bank details was sent back: <reason>", "HR now requires Documents — please complete and submit.")

Use existing notifications schema (kind text + body text). No new table.

### Employee onboarding page banner
File: `src/routes/_authenticated/complete-onboarding.tsx`

Add a banner strip below the header when `sections` contains any unread event since last visit. Cheapest implementation: derive purely from current section state — no read/unread tracking:

- If any required section is `rejected` → destructive banner listing those sections + rejection reasons, with jump links that scroll to each card.
- Else if any required section is `submitted` → amber banner "Waiting on HR review for N sections."
- Else if any section was `approved` in the last 7 days → green banner "N section(s) approved by HR."
- Else if new required sections were turned on and are still `draft` → blue banner "HR added new required sections. Please complete them."

Also, on each individual `SectionCard`, promote status to a large colored pill in the card header (currently only a small pill in the top summary) so approval / rejection is visible while filling.

## 3. Wire the notifications bell

If the bell UI doesn't already render `onboarding_*` kinds with a link to `/complete-onboarding`, add those kind → route mappings. Otherwise, no change (they'll show as generic notifications).

## Technical notes

- No DB schema changes needed. All new state uses existing tables (`notifications`, `onboarding_section_state`, `profiles`).
- Notifications inserts must succeed even for pre-existing rows — use `insert` with fresh `id` each time; failures should not roll back the approval.
- The Required toggle uses the existing `setOnboardingSectionRequired` server fn (already handles the "reset approved → draft" case).
- No changes to auth, RLS, or edge functions.

## Out of scope

- Email notifications (not asked).
- Read/unread tracking on the banner (state-derived is sufficient).
- Redesigning the Directory-side required checkboxes (Required toggle now also lives in the review sheet; the Directory popover stays as-is).
