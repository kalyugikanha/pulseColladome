## Fix salary total (₹299,000 → ₹294,000)

Sweksha has two invite rows in `role_grants` — `sweksha@colladome.in` (₹5,000) and the alias `sweksha.colladome@gmail.com` (₹5,000). Because she hasn't signed up yet, both count as pending and inflate the pool by ₹5,000.

### Change
- Delete the alias `sweksha.colladome@gmail.com` from `role_grants` (data-only change via insert tool).
- Keep `sweksha@colladome.in` — that's the invite the super-admin "Provision pending users" button will convert into a real account.

Total pool becomes ₹294,000, matching the 15-employee roster.

### Not doing
- No schema or UI changes. The existing merge logic (profiles + pending grants) is correct as long as `role_grants` has one row per person.
- No code guard against future alias duplicates — trivial to add later if invite aliases become common.
