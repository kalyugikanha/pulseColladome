# Super Admin: Full Employee Profile view + edit

## Where it lives today
- **Directory** (`/directory`) — Super Admin can edit only a small subset: name, department, reporting manager, employment type, phone, and (bank) account number + IFSC. No view of documents or other profile fields.
- **HR Admin → Onboarding Approvals** (`/hr-admin?tab=approvals`) — has a rich read-only review sheet with all profile fields, bank, and documents (Aadhar, PAN, screenshots, review proofs, etc.). But it's **read-only**, only lists people with a pending/approved submission, and doesn't let Super Admin change anything.

So there is no single place to fully inspect + edit an already-onboarded employee.

## What to build
Add a **"View full profile"** action to every row in the Employee Directory (Super Admin only). Opens a full-width Sheet with two modes: **View** (default) and **Edit** (toggle).

### Sheet contents (all fields currently captured during onboarding)
Grouped sections, mirroring the onboarding form:

1. **Identity** — full_name, email (read-only), personal_email, phone, date_of_birth, marriage_anniversary, permanent_address, hobbies, profile_picture_url (with preview)
2. **Work** — department, employment_type, joined_on, reporting_manager_id, day_start_time, standup_time, is_active, onboarding_required
3. **Social & links** — linkedin_url, github_url, facebook_url, instagram_url, twitter_url, youtube_url, pinterest_url
4. **Bank details** (`employee_bank_details`) — account_holder_name, account_number, ifsc_code, bank_branch, pan_number
5. **Salary** — current active row from `salaries` (monthly_salary, currency, effective_from) with a "Manage in Finances" link. Read-only here to avoid duplicating the Finances flow.
6. **Roles** — badges for user_roles + super_admin (read-only; role changes stay in HR Admin → Access & Roles).
7. **Documents & proofs** — every `OnboardingDocType` from `hr.onboarding.tsx` (offer letter, Aadhar, PAN, cancelled cheque, marksheets, graduation, masters, resume, profile picture, 7 social-follow screenshots, 4 review screenshots, LinkedIn employment proof). Each row shows Uploaded/Missing, an "Open" button (signed URL via existing `getEmployeeDocumentUrl` server fn), and — in Edit mode — a "Replace" upload button that uses the existing `employee-documents` bucket and `recordMyDocument` pattern (new server fn `adminReplaceEmployeeDocument`).

### Edit behaviour
- Toggle "Edit" enters an editable form for sections 1–4. Save button persists via a new server function `adminUpdateEmployeeProfile` (Super Admin gate) that updates `profiles` + upserts `employee_bank_details`.
- Document Replace uploads to the same storage path convention and upserts `employee_documents`.
- Reuse existing destructive actions (deactivate / hard delete) that already live in the Directory row.

### Access control
- Trigger button visible only to Super Admins (`me.isSuperAdmin`). HR Admin keeps today's limited edit dialog; nothing changes for lower roles.
- All new server functions gate on super_admin membership.

## Files

**New**
- `src/components/directory/employee-profile-sheet.tsx` — the Sheet UI (view/edit modes, document grid, replace upload).
- `src/lib/admin-employee.functions.ts` — server functions:
  - `adminGetEmployeeFull({ user_id })` — returns profile + bank + documents + active salary + roles.
  - `adminUpdateEmployeeProfile({ user_id, profile, bank })` — Super Admin only.
  - `adminReplaceEmployeeDocument({ user_id, doc_type, storage_path })` — Super Admin only.

**Edited**
- `src/routes/_authenticated/directory.tsx` — add a "Profile" button in the actions column (Super Admin only) that opens the new Sheet. Keep the existing lightweight Edit dialog for HR Admin.

## Out of scope
- Changing roles, salary rows, or leave balances (already have dedicated screens).
- Bulk edits.
