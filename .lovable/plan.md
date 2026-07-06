## Goal

Turn onboarding into an HR-approved gate: employees upload screenshot proof for every social follow, every review, and the LinkedIn "now working at Colladome" update. After submit, portal stays locked until HR admin (or super admin) approves. Approval automatically fires a welcome-post task to Kanishka in Marketing.

## 1. New required screenshot proofs

Add these to `employee_documents.doc_type` (extend the type union) and mark them required in `completeMyOnboarding`:

- `follow_facebook`, `follow_instagram`, `follow_twitter`, `follow_linkedin`, `follow_youtube`, `follow_pinterest`, `follow_whatsapp`
- `review_google_jaipur`, `review_google_hyderabad`, `review_glassdoor`, `review_ambitionbox`
- `linkedin_employment` (screenshot of their own LinkedIn profile showing "Works at Colladome")

**Complete-onboarding page changes:**
- Replace the "tick the box" pattern for follows/reviews with per-item **screenshot upload rows** (same UX as the existing document uploads). Uploading a file for `follow_facebook` counts as confirmation; the tick disappears.
- Add a new "LinkedIn — proof of employment update" section with its own upload slot.
- Optional "About you / hobbies & interests" textarea → stored on `profiles.hobbies` (new column). Feeds the welcome post.
- Submit button becomes **"Submit for HR approval"**. On success, redirect to a "Waiting for HR approval" screen instead of `/dashboard`.

## 2. Approval gate

**Schema (`profiles`)**
- Add `onboarding_submitted_at timestamptz`
- Add `onboarding_approved_at timestamptz`
- Add `onboarding_approved_by uuid` (FK profiles)
- Add `onboarding_rejected_at timestamptz`
- Add `onboarding_rejection_reason text`
- Add `hobbies text`

**`completeMyOnboarding` server fn**
- Validate everything (all fields + all new proof docs). On success: set `onboarding_completed=true`, `onboarding_submitted_at=now()`. Do NOT set `onboarding_approved_at`.

**Portal gate (`_authenticated/route.tsx`)**
- If `profile.onboarding_required` AND `onboarding_approved_at IS NULL`:
  - If `onboarding_submitted_at IS NULL` → redirect to `/complete-onboarding` (existing behavior).
  - Else → redirect to a new `/onboarding-pending` route showing "Submitted, waiting for HR approval" + rejection reason if any + "Edit submission" button back to `/complete-onboarding`.
- HR admin and super admin bypass this gate (so approvers can always sign in).

## 3. HR approval UI

New route `/_authenticated/hr.onboarding.tsx` (visible to `hr_admin` + super admin, sidebar entry "Onboarding approvals"):
- Tabs: **Pending**, **Approved**, **Rejected**
- Each row → drawer with:
  - All personal/work/bank fields
  - Uploaded documents (existing signed-URL viewer already exists via `getEmployeeDocumentUrl`)
  - Each social follow + review screenshot preview (signed URL)
  - LinkedIn employment screenshot preview
  - Hobbies / about section
  - **Approve** button and **Reject with reason** button

**Server fns (`src/lib/onboarding-approvals.functions.ts`)**
- `listOnboardingSubmissions({ status })` — auth: hr_admin | super_admin
- `approveOnboarding({ user_id })` — auth: hr_admin | super_admin. Sets approval fields, then calls `createWelcomeTask(user_id)` inline.
- `rejectOnboarding({ user_id, reason })` — auth: hr_admin | super_admin. Sets rejection fields and clears `onboarding_submitted_at` so employee can resubmit.

## 4. Auto welcome-post task for Kanishka

On approval, insert into `tasks`:
- `assignee_id` = Kanishka's profile id (looked up by `email = 'kanishka@colladome.in'`). If not found, log a warning and skip (approval still succeeds).
- `title` = `Welcome post — {full_name}`
- `description` = markdown with: full name, department, joined_on, hobbies/about, LinkedIn URL, profile picture URL (signed URL not appropriate; use the storage path so Marketing can pull it, plus the person's Instagram/Twitter handles if provided).
- `status` = `todo`, `priority` = `normal`, `due_date` = `now() + 3 days`
- `created_by` = approver's `userId`

Idempotency: before insert, check whether a task with `title = 'Welcome post — {full_name}'` and `assignee_id` = Kanishka already exists in the last 30 days; skip if so.

## 5. Access to the tool during pending review

- Employee can still open `/complete-onboarding` to edit uploads if HR rejects.
- All other authenticated routes redirect to `/onboarding-pending` for that user.

## Files touched

- **Migration**: profile columns above + extend doc_type check if it's an enum (currently text — no migration needed for values, just for new columns).
- `src/lib/onboarding.functions.ts` — extend `OnboardingDocType`, extend `REQUIRED_DOCS`, add hobbies to profile patch, split submit into "submit for approval" flow.
- `src/lib/onboarding-approvals.functions.ts` — **new**, list/approve/reject + welcome task creator.
- `src/routes/_authenticated/complete-onboarding.tsx` — swap follow/review checkboxes for screenshot uploads, add hobbies + LinkedIn employment upload, update copy.
- `src/routes/_authenticated/onboarding-pending.tsx` — **new** waiting screen.
- `src/routes/_authenticated/hr.onboarding.tsx` — **new** HR approvals dashboard.
- `src/routes/_authenticated/route.tsx` — extend gate to check approval status (bypass for hr_admin/super_admin).
- Sidebar — add "Onboarding approvals" link for hr_admin/super_admin.

## Confirmations before I build

1. **Rejection returns employee to `/complete-onboarding` to fix and re-submit** — correct? (default: yes.)
2. **HR admin & super admin bypass their own approval gate** so they can log in without needing a second HR to approve them — correct? (default: yes.)
3. **Kanishka's welcome task = single task assigned to her personally** (not to a "Marketing" project queue). Due in 3 days, `normal` priority. OK? Adjust if you want a specific project or higher priority.
4. **Hobbies field** — add as a single free-text "About you / hobbies & interests" box. OK, or do you want individual fields (hobbies, hometown, fun fact, favourite food)?
