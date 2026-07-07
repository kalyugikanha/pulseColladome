## 1. Fix attendance visibility (managers see reporting team only)

Right now Kanishka sees the whole Marketing department because she is a Department Head for "Marketing" (`department_heads` table) — not because of a bug. Akash is the head of "Project Management" so he sees that department; Juhi has no head row so she sees only her direct reports.

You want: **only admins/HR/super-admins see everyone; everybody else sees just their own reporting tree (self + everyone under them).**

Changes:
- Drop the department-head SELECT/UPDATE paths from `attendance_logs`, `leave_requests`, `punch_sessions`, and related management screens. The `department_heads` concept is retired for visibility purposes (we can keep the table for now, unused).
- Add a `private.reports_tree_ids(_manager)` recursive helper (full subtree, not just direct reports). Reuse the one from the BD plan if we introduce it in the same turn.
- Add RLS policies: `attendance: manager tree read/update`, same for `leave_requests`, `punch_sessions`, using `_manager IN reports_tree_ids(auth.uid())`.
- `use-visibility-scope.ts`: drop `deptScope`; `userScope` becomes the full reports tree (self + all descendants) fetched from a small server fn `listReportsTree()`.
- Attendance page: `canView = isAdmin || isReportingManager` (drop `isDepartmentHead`); cards + table use the tree scope.
- Verify: Kanishka sees only her 6 reports + self; Juhi sees Sarita, Riyanshi + self; Akash sees his 1 report + self; Shubham (admin) sees everyone.

## 2. Seed profile data for 18 employees

Seed by lowercased email (works for both existing auth users and future signups):

- **`profiles`**: `full_name`, `department`, `phone`, `permanent_address`, `date_of_birth`, `marriage_anniversary`, `linkedin_url`, `github_url`, `day_start_time`, `standup_time`, `profile_picture_url`. Rows that don't exist yet are inserted as placeholders (`is_placeholder=true`, generated uuid) so `handle_new_user` merges them on first sign-in.
- **`employee_bank_details`**: `account_holder_name`, `account_number`, `bank_branch`, `ifsc_code`, `pan_number` — only for rows where an auth user exists (FK to `auth.users`).
- **`employee_documents`**: one row per non-empty Drive link, mapped to enum: `resume`, `profile_picture`, `offer_letter`, `aadhar`, `pan`, `cancelled_cheque`, `marksheet_10`, `marksheet_12`, `graduation`, `masters`. `storage_path` stores the Drive URL as-is (pragmatic — we don't re-host). Also FK-gated to existing auth users.

Free-text time strings ("9 AM - 10 AM", "10 AM - 6 PM") are parsed to the **start** time. Weird values like "4:00:00 PM" as day_start are kept as-is. "N/a"/"NA"/blank ⇒ NULL. Ambiguous dates (e.g. "30-Apr-2025") normalized to ISO.

Arti Kumawat's row is all blank ⇒ skipped.

Executed via the migration tool (one-shot idempotent upserts on `(user_id, doc_type)` and email-keyed upserts on `profiles`/`employee_bank_details`).

## 3. Profile completion %

Client helper `computeProfileCompletion(profile, bank, docs)` counts filled fields out of a fixed 25-field checklist matching the seed columns above. Shown as:
- A ring/badge on **My Profile** (`/profile`) with a checklist of missing items.
- A "Completion" column in the **HR → Team** roster.

## 4. HR approval workflow

The `profiles` table already has `onboarding_submitted_at / approved_at / approved_by / rejected_at / rejection_reason` — we wire them up:

- **Employee side (`/profile`)**: banner shows current status (`draft` / `pending HR approval` / `approved` / `changes requested`). "Submit for HR approval" button (enabled once completion ≥ 90% AND required fields filled) sets `onboarding_submitted_at = now()`. After submit, fields are read-only until HR approves or requests changes.
- **HR side (new `/hr/approvals` route, gated to `isHrAdmin || isAdmin`)**: list of pending submissions with per-employee diff of key fields + document links. Actions: **Approve** (sets `onboarding_approved_at`, `onboarding_approved_by`, `onboarding_completed=true`, `onboarding_required=false`) or **Request changes** (sets `onboarding_rejected_at` + `onboarding_rejection_reason`, clears `onboarding_submitted_at` so employee can edit again).
- Server fns in `src/lib/onboarding.functions.ts`: `submitOnboarding()`, `approveOnboarding(userId)`, `rejectOnboarding(userId, reason)` — all with `requireSupabaseAuth` and HR/admin checks for the approve/reject ones.
- Notification row inserted for the employee on approve/reject; HR admins notified on submit.
- RLS: profile writes to onboarding_* columns restricted to (self for `submitted_at`) and (HR/admin for the rest) via a trigger check.

## Files touched

- new migration: attendance/leave/punch RLS + `reports_tree_ids` helper
- new migration: seed profiles/bank/documents (idempotent)
- new migration: onboarding submit/approve trigger + notification policies
- new `src/lib/onboarding.functions.ts`
- new `src/lib/profile-completion.ts`
- new `src/routes/_authenticated/hr.approvals.tsx`
- edit `src/hooks/use-visibility-scope.ts`
- edit `src/routes/_authenticated/attendance.tsx` (remove dept-head branch)
- edit `src/routes/_authenticated/profile.tsx` (completion ring + submit banner)
- edit `src/routes/_authenticated/hr.*` sidebar to add Approvals link

Confirm and I'll build.
