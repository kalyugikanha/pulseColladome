
## Full Employee Onboarding — Self-Serve on First Login

Extend the existing onboarding module so every new hire fills a complete onboarding form (personal details, bank info, and document uploads) themselves on first login, and cannot access any other part of the tool until it's done.

### 1. Flow

1. HR/Super Admin creates the account on `/onboarding` (email + role + joining date, as today). Temporary password `Test@123`, `must_change_password = true`, `onboarding_completed = false`.
2. New hire logs in → forced to `/change-password` (existing flow).
3. After password change → forced to new `/complete-onboarding` route.
4. Only after every required field + document is submitted does `onboarding_completed` flip to `true` and the app unlocks (`/dashboard`, etc.).

Hard block: a root-level guard in `_authenticated/route.tsx` redirects to `/complete-onboarding` for any signed-in user with `onboarding_completed = false` (except the onboarding route itself, `/change-password`, and sign-out). No dashboard, calendar, tasks, punch, etc.

### 2. Onboarding form fields (all required unless noted)

**Personal**
- Full name, Official email (read-only, from auth), Personal email
- Phone number, Permanent address (textarea)
- Date of birth, Marriage anniversary *(optional)*
- LinkedIn profile URL, GitHub/GitLab URL
- Profile picture (image upload)

**Work**
- Job department (dropdown — same list as today)
- Joining date (pre-filled by HR, read-only)
- Preferred day-start time, Preferred standup time

**Bank details**
- Account holder name, Account number, Bank branch, IFSC code, PAN card number

**Document uploads** (PDF/JPG/PNG, max 10 MB each)
- Signed offer letter, Aadhar card, PAN card, Cancelled cheque
- 10th marksheet, 12th marksheet, Graduation certificate
- Master's certificate *(optional)*
- Updated resume

### 3. Database changes (one migration)

- `profiles`: add
  - `personal_email text`, `permanent_address text`
  - `marriage_anniversary date`
  - `linkedin_url text`, `github_url text`
  - `profile_picture_url text`
  - `day_start_time time`, `standup_time time`
  - `onboarding_completed boolean not null default false`
  - `onboarding_completed_at timestamptz`
- New table `public.employee_bank_details` (1:1 with user): account_holder_name, account_number, bank_branch, ifsc_code, pan_number. RLS: user reads/writes own row; super_admin + hr_admin read all.
- New table `public.employee_documents`: `user_id`, `doc_type` (enum: offer_letter, aadhar, pan, cancelled_cheque, marksheet_10, marksheet_12, graduation, masters, resume, profile_picture), `storage_path`, `uploaded_at`. Unique `(user_id, doc_type)`. RLS: user inserts/updates own; super_admin + hr_admin read all; user reads own only for uploaded-file confirmation (no download URL rendered on their side per spec).
- Storage bucket `employee-documents` (private). RLS on `storage.objects`:
  - User can insert/update objects under `${auth.uid()}/…`.
  - Only super_admin + hr_admin can `select` (download/signed URL).
- Grants on all new public tables to `authenticated` + `service_role` (no `anon`).

### 4. Server functions (`src/lib/onboarding.functions.ts`)

- `getMyOnboarding()` — returns current profile fields + bank row + list of uploaded doc types (self).
- `saveMyOnboarding({ profile, bank })` — validates with zod, upserts profile fields + bank row for `auth.uid()`.
- `completeMyOnboarding()` — verifies every required field is filled and every required doc uploaded; sets `onboarding_completed = true, onboarding_completed_at = now()`. Returns typed errors listing missing items.
- `getEmployeeDocumentUrl({ user_id, doc_type })` — HR/Super only; returns short-lived signed URL from private bucket.

Document uploads use the browser Supabase client directly to storage path `${uid}/${doc_type}.${ext}`, then call a lightweight `recordDocument({ doc_type, storage_path })` server fn to write the `employee_documents` row.

### 5. Frontend

- **New route** `src/routes/_authenticated/complete-onboarding.tsx` — multi-section form (Personal → Work prefs → Bank → Documents → Review & Submit). Progress indicator. Save-as-you-go per section. Final "Complete onboarding" button calls `completeMyOnboarding` and, on success, navigates to `/dashboard`.
- **Guard** in `_authenticated/route.tsx`: after existing auth check, if `profile.onboarding_completed === false` and pathname ≠ `/complete-onboarding` and ≠ `/change-password`, redirect to `/complete-onboarding`.
- **HR/Super Admin `/onboarding` page** (existing): keep the create-user form. In the "Team directory" drawer add:
  - Onboarding status badge (Complete / Pending) + completed date.
  - Read-only view of submitted personal + bank fields.
  - Document list with "Download" buttons (signed URLs via `getEmployeeDocumentUrl`).
- Sidebar/top-bar entries stay hidden for users with incomplete onboarding (guard already blocks navigation anyway).

### 6. Out of scope (explicit)

- Editing documents after submission (v1: user can re-upload same doc type before completing; after `onboarding_completed = true`, only HR/Super can request changes — no self-edit UI yet).
- Emailing the temp password (HR still shares it manually, as today).
- Bulk CSV import.

### 7. Technical checklist

- Migration: 3 new public tables/columns as above + private storage bucket + RLS policies + grants.
- Server functions file `src/lib/onboarding.functions.ts` (4 fns).
- New route `complete-onboarding.tsx`.
- Update `_authenticated/route.tsx` guard + `use-current-user` to expose `onboardingCompleted`.
- Extend HR drawer on `/onboarding` with doc viewer.
- Zod schemas for validation (IFSC regex, PAN regex `[A-Z]{5}[0-9]{4}[A-Z]`, phone digits, URLs).
