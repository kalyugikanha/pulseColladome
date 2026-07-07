## Seed Deepak Patel and Sweksha Jadon

Create placeholder profiles + role_grants so both employees are pre-provisioned. On their first Google sign-in, the existing `handle_new_user` trigger merges the placeholder into their real auth account.

### Data source

Row-by-row from the pasted table for `deepak@colladome.in` (Designing) and `sweksha@colladome.in` (Human Resources).

### What gets seeded now (insert tool)

**`role_grants`** — one row each:
- Deepak: role `employee`, department `Designing`
- Sweksha: role `employee`, department `Human Resources`
- No super-admin, no salary override (not provided).

**`profiles`** (placeholder rows, `is_placeholder = true`, random UUID, `email` set so the trigger picks them up):
- `full_name`, `email`, `department`
- `date_of_birth` (Deepak 2001-09-17, Sweksha 2003-03-21)
- `marriage_anniversary` NULL (blank in sheet)
- `phone`, `permanent_address`
- `linkedin_url`, `github_url`
- `profile_picture_url` (Drive link)
- `day_start_time` 09:00 for both; `standup_time` 09:00 (Deepak) / 10:00 (Sweksha)
- `onboarding_required = true` so they finish onboarding themselves after sign-in

### What is NOT seeded

- **`employee_bank_details`** and **`employee_documents`** — both FK to `auth.users(id)`; neither user has signed in yet, so the DB rejects the insert. Bank fields (account holder, account no., branch, IFSC, PAN) and document links (resume, offer letter, Aadhar, PAN, cheque, marksheets, degrees) are staged in the plan below — I'll insert them automatically the first time either user signs in via a small follow-up (either a one-time backfill script triggered from the HR admin UI, or added to `handle_new_user`). Flag if you'd prefer a different approach.

Staged bank data:
- Deepak: Deepak Patel · 87760100020015 · ANAND NAGAR JABALPUR · BARB0DBAJAP · PAN GVBPP5558Q
- Sweksha: Shwekasha Jadoun · 40466172369 · BUS STAND, ABU ROAD · SBIN0031520 · PAN DGLPJ7515K (note: sheet's "PAN Card" column for Sweksha reads `DGLPJ7515K` — this is a valid PAN pattern, using as-is)

Staged document links (Google Drive URLs stored in `storage_path` as text): resume, profile_picture, offer_letter, aadhar, pan, cancelled_cheque, marksheet_10, marksheet_12, graduation. Deepak also has a masters cert; Sweksha does not.

### Verification

After the migration, query `profiles` + `role_grants` for both emails and confirm they show up on the HR Admin employee list.
