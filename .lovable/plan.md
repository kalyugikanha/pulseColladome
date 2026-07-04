## What "official email only" means here

Right now there are two kinds of profiles for the same real people:

- **Placeholder profiles** (`id = 11111111‑…`, `email = *@placeholder.colladome.local`, `is_placeholder = true`) — seeded so June 2026 hours have someone to attach to.
- **Real profiles** (real `id`, official `@colladome.in` / `@colladome.com` email) — created when the person actually signs in.

For **Kanishka** and **Akash**, both exist. That's the duplication. For the rest, only the placeholder exists (no auth account yet), and its email is the fake `*.placeholder.colladome.local`.

## Fix (data-only migration)

### 1. Merge duplicates — placeholder → real, then delete placeholder

For each duplicate pair, re‑point all references (attendance, salaries, leave balances/requests, punch sessions, roles) from the placeholder id to the real id, then delete the placeholder profile.

| Placeholder (delete) | Real profile (keep) |
|---|---|
| `11111111‑…0001` Kanishka | `e0ce11c3…` kanishka@colladome.in |
| `11111111‑…0004` Akash | `02cf3091…` akash@colladome.in |

Conflict handling on re‑point:
- `attendance_logs (user_id, date)` unique: if both ids have a row on the same date, merge task arrays and keep one; delete the placeholder row.
- `salaries (user_id, effective_from)` unique: keep the real user's row; drop the placeholder duplicate.
- `leave_balances (user_id, leave_type)` unique: sum `allocated`/`used`, keep real, drop placeholder.
- `leave_requests`, `punch_sessions`: simple re‑point (no unique on user_id).
- `user_roles`, `super_admins`: keep real user's existing rows.

### 2. Rename remaining placeholders to their official email

Keep the placeholder id (no auth user yet), but flip `email` to the official address from `role_grants` and clear `is_placeholder`. That way Finances/Project Burn/Team see the real name and official email, and when the person eventually signs in the trigger will attach roles by matching email.

| Placeholder id | New official email | Salary source |
|---|---|---|
| …0002 Deepak | deepak@colladome.in | grant 20000 |
| …0003 Sharaddha | shraddha.saxena@colladome.in | grant 15000 |
| …0005 Sweksha | sweksha@colladome.in | grant 5000 |
| …0006 Chirag | chirag@colladome.com | grant 30000 |
| …0007 Juhi | juhi@colladome.com | grant 20000 |
| …0008 Anjali | anjali@colladome.in | grant 6000 |
| …0009 Neetu | neetu@colladome.in | grant 2000 |
| …0010 Sridhar Hemanth | hemanth@colladome.in | grant 10000 |
| …0011 Manvi | manvi@colladome.in | grant 5000 |
| …0012 Trisha | trisha@colladome.in | grant 5000 |

### 3. Sandhya (…0013) and Shaleen (…0014)

No matching `role_grants` entry, so no official email or salary on file. Two options — **tell me which**:

- (a) Leave them as placeholders (their June hours stay logged but contribute 0 to burn), or
- (b) Give me their official emails + monthly salaries and I'll rename + add salary in the same migration.

## Not doing

- Not creating auth accounts for the renamed placeholders. That still happens through **Access & Roles → Create account** when each person is onboarded.
- Not changing UI/business logic.

## Technical

Single migration wrapped in a transaction:
- CTEs to detect same‑date `attendance_logs` collisions, merge task JSON arrays, delete losers.
- `UPDATE … SET user_id = real_id WHERE user_id = placeholder_id` on the six user‑scoped tables, with `ON CONFLICT` handled per table above.
- `DELETE FROM profiles WHERE id IN (…0001, …0004)`.
- `UPDATE profiles SET email = …, is_placeholder = false WHERE id = …` for each renamed placeholder.
