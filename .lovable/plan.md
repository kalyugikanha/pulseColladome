## Goal

1. Let super admins edit any project's details from the Projects page.
2. Add a Vendors module with vendor list (seeded with Yash, Akash, Sufi) and per-project vendor payment tracking.

## 1. Edit any project

- Add `end_date DATE` column to `projects` (for full edit).
- On the Projects page, add a pencil "Edit" button on each project card, visible only when `me.canManageProjects` (admins + project managers, which already includes super admins).
- Opens a dialog pre-filled with all fields: Project ID (code), Name, Client, Description, Status, Start date, End date. Save → `update` on `projects`.
- RLS already lets admins/super admins/project managers update projects; no policy change needed.

## 2. Vendors module

### Schema (new migration)

```sql
CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vendor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending', -- pending | paid
  description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- GRANTs to `authenticated` and `service_role`.
- RLS: only super admins can select/insert/update/delete (`is_super_admin(auth.uid())`).
- `updated_at` triggers on both.
- Seed: insert Yash, Akash, Sufi into `vendors`.

### New page `/vendors` (super admin only)

- Sidebar link "Vendors" (icon: Users/Handshake), visible only when `me.isSuperAdmin`.
- Route file `src/routes/_authenticated/vendors.tsx`. Redirects non-super-admins to `/dashboard`.
- Layout:
  - Section "Vendors": list with add / edit / delete. Fields: name, email, phone, notes.
  - Section "Payments": table of all vendor payments with filters by vendor and project. "Log payment" dialog: vendor (select), project (select, optional), amount, currency (INR default), date, status, description. Row actions: edit, mark paid/pending, delete.
  - Summary chips: total pending, total paid (current month).

### Projects page addition

- Under each project card, show a compact "Vendor payments" line for super admins: total pending + total paid on that project, with a "View" button that opens the same vendor payment log filtered to this project (dialog).

## Out of scope

- No invoice numbers, attachments, or payment methods (basic log only).
- No changes to existing role model — super admin = Shubham + Arti.

## Technical Details

- Files touched: `supabase/migrations/*` (2 migrations: end_date + vendor schema/seed), `src/routes/_authenticated/vendors.tsx` (new), `src/routes/_authenticated/route.tsx` (sidebar link), `src/routes/_authenticated/projects.tsx` (edit dialog + per-project vendor payment strip).
- All new writes use the browser Supabase client under RLS restricted to super admins.
- No new secrets or connectors.