## Consolidate departments to 4 + assign people

### Departments (taxonomy_departments)

Reduce to exactly 4:
- Business Development
- Tech Development
- Marketing
- Admin

Any other existing department rows get soft-removed (`is_active = false`) so historical task references stay intact. Their `name` is preserved.

### Profile department assignments

Update `profiles.department` (free-text field used across the app) to the new canonical strings:

- **Business Development**: Jagjeet Singh Jassal, Sarita Kumari, Riyanshi Sharma (= Rishita), Chirag Bansal, Juhi Nagar, Neetu Rauniyar
- **Tech Development**: Arpit Kast, Akash Jangid
- **Marketing**: Kanishka Khunteta, Sweksha Jadon (= Shweksha), Sandeep Kumar Mandal, Deepak Patel, Anjali, Trisha Panday, Manvi Bansal, Addala Hemanth Sridhar (= Sridhar), Sandhya
- **Admin**: Shraddha Saxena
- **No department** (super admins): Arti Kumawat, Shubham Saxena

Anyone not listed above (none currently) — no change.

### Roles

Already correct:
- Arti & Shubham are in `super_admins` with `admin` role.
- Shraddha has `hr_admin` role.

No role changes needed.

### Employee Directory UI

Update the directory (`src/routes/_authenticated/directory.tsx` or the directory tab under `/team`) so each person's card/row shows their role badge alongside department:
- Super Admin (from `super_admins` table)
- Admin / HR Admin / Manager / Employee (from `user_roles`)

Roles rendered as small colored badges next to name; department shown as-is.

### Technical section

1. **Migration** (`supabase--migration`):
   - `UPDATE taxonomy_departments SET is_active = false WHERE name NOT IN ('Business Development','Tech Development','Marketing','Admin');`
   - `INSERT ... ON CONFLICT` to ensure the 4 canonical rows exist and are active.
   - Bulk `UPDATE profiles SET department = ... WHERE id IN (...)` for each of the 4 groups, plus `SET department = NULL` for the two super admins.

2. **Directory component**: fetch `user_roles` + `super_admins` for the listed profiles (single query joining), render role badges. No schema changes for this — data already exists.

No changes to tasks, RLS, or auth. Server functions untouched.