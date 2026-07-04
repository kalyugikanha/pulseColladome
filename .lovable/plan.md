## Why June shows no burn

Two independent gaps — both are data, not code:

1. **All salary rows are effective from 2026‑07‑01 or later.** Project Burn skips any salary whose `effective_from` is after the selected month's last day, so for June every user resolves to salary 0 → burn 0. Real users with June hours (Arti, Sandeep, Jagjeet, Shubham) are excluded.
2. **Most June hours sit on placeholder profiles** (`11111111‑…` ids from the initial seed: Kanishka, Deepak, Sharaddha, Akash‑mock, Sweksha, Juhi, Anjali, Neetu, Sridhar Hemanth, Manvi, Trisha, Sandhya, Shaleen). None of those placeholder ids have a `salaries` row, so even with the date fixed they contribute 0 to burn.

Net effect: the June salary pool the allocator sees is ₹0, so every project shows 0 hrs of burn even though hours are logged.

## Fix (data-only, one migration)

Insert June‑effective salary rows so the allocator has a pool to distribute. No UI or business‑logic changes.

**A. Real users — backdate June salary** (same monthly value already on file, `effective_from = 2026‑06‑01`, currency INR):

| Name | user_id | Monthly |
|---|---|---|
| Arti | 9869d739… | 60000 |
| Jagjeet | 58c14ca5… | 28000 |
| Sandeep | 38290b50… | 13000 |
| Kanishka | e0ce11c3… | 35000 |
| Aakash (real) | 02cf3091… | 40000 |

Shubham (`15a70001…`) is finance admin with no salary on file — skipped unless you say otherwise.

**B. Placeholder profiles — add June salary from `role_grants` by name→email** (only rows where a grant exists):

| Placeholder | Name | Grant email | Monthly |
|---|---|---|---|
| …0001 | Kanishka | kanishka@colladome.in | 35000 |
| …0002 | Deepak | deepak@colladome.in | 20000 |
| …0003 | Sharaddha | shraddha.saxena@colladome.in | 15000 |
| …0004 | Akash (mock) | akash@colladome.in | 40000 |
| …0005 | Sweksha | sweksha@colladome.in | 5000 |
| …0006 | Chirag | chirag@colladome.com | 30000 |
| …0007 | Juhi | juhi@colladome.com | 20000 |
| …0008 | Anjali | anjali@colladome.in | 6000 |
| …0009 | Neetu | neetu@colladome.in | 2000 |
| …0010 | Sridhar Hemanth | hemanth@colladome.in | 10000 |
| …0011 | Manvi | manvi@colladome.in | 5000 |
| …0012 | Trisha | trisha@colladome.in | 5000 |

Placeholders **…0013 Sandhya** and **…0014 Shaleen** have no matching grant → no salary added → their June hours (small: RR Pay 4h, Growinsight 10h; Oswal 60h, Outfitq 30h) still contribute 0 burn. Tell me their monthly numbers and I'll include them.

## Technical

- Single migration using `INSERT … ON CONFLICT (user_id, effective_from) DO UPDATE` on `public.salaries`, `effective_from='2026-06-01'`, `currency='INR'`.
- No changes to `project-burn.tsx`, `handle_new_user`, or role logic.
- Project Burn's "Salary pool" and per‑project burn for June will populate immediately after the migration.

## Not doing (unless you ask)

- Merging placeholder June hours into real user ids (Akash‑mock → real Akash, Kanishka placeholder → real Kanishka). Keeping placeholders keeps the seed intact.
- Adding a salary for Shubham, Sandhya, Shaleen.
