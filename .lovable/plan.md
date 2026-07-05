## Root cause
The log row you created is saved with `user_id = Shubham` (not Kanishka). Confirmed from the DB:

```
date: 2026-07-05, user_id: Shubham Saxena,
last_edited_by: Shubham Saxena, tasks: [CLDM00000 · 4h · Test by Shubham]
```

The culprit is the **"View as"** super-admin impersonation. In `src/hooks/use-current-user.ts`, when a super admin views as another user, the returned object swaps `fullName`, `email`, and role flags to the impersonated user — but `id` stays as the *real* signed-in user (Shubham). So:

- `/my-timesheet` renders with `userId={me.id}` → Shubham's timesheet, even though the header says "Kanishka".
- The Day Editor saves with `user_id: userId` → Shubham.
- `last_edited_by: myId` (from `auth.getUser()`) → Shubham (correct, but same person as user_id).

Net effect: you thought you were creating an entry on Kanishka's day, but you were actually adding a row to Shubham's own timesheet — which is why it shows up under Shubham Saxena in the admin view.

## Fix — two options, please pick one

### Option A · Full impersonation (recommended if "view as" is meant for reproducing what a user sees *and* acting on their behalf)
- `useCurrentUser` returns `id = viewAsUserId` while impersonating; keep the real auth id in `realId`.
- Update every "who did it" write (`decided_by`, `last_edited_by`, `approved_by`, `created_by`) to use `realId` — so audit trails always name Shubham, not Kanishka.
- Persistent yellow banner: **"Viewing as Kanishka Khunteta — actions are attributed to you"**, with an "Exit" button.
- Behavior after fix: opening `/my-timesheet` while viewing as Kanishka shows Kanishka's timesheet; adding a row saves under Kanishka. RLS still requires Shubham (super admin) to have write privileges — he does.

### Option B · Read-only impersonation (safer, standard "view as")
- Keep `id` = real auth id (as today).
- While `viewingAs === true`, **disable all write affordances** — hide/gray out Save, Delete, Add row, Approve, Punch, Apply leave, etc. Query reads stay real-user's; the "Kanishka" name in the header only tells you which lens the role flags are set to (for testing what she can see).
- Fix `/my-timesheet` to also read from the impersonated id so the page shows Kanishka's data (read-only) rather than Shubham's.
- Persistent banner: **"Viewing as Kanishka (read-only)"** with Exit.

### Option C · Retire "view as" entirely
- Remove the impersonation feature. Super admins already see everything; testing another user's view is done via a separate account.
- Simplest, no attribution risk. Rollback of the buggy row is a one-time DB cleanup.

## Cleanup (either option)
- Delete or reassign the misattributed 5 Jul row (`id = 1f1d4d0f-…`). If you want it moved to Kanishka, I'll update `user_id`; if you want it gone, I'll delete it.

## Files touched
- `src/hooks/use-current-user.ts` (both A and B)
- Every write site listed above (Option A only): `attendance.tsx`, `punch.tsx`, `leave.tsx`, `projects.tsx`, `tasks.tsx`, `day-editor-sheet.tsx`, `my-timesheet.tsx`
- A banner component + mount in `__root.tsx` or `_authenticated/route.tsx`
- `src/hooks/use-visibility-scope.ts` self-inclusion uses `realId` (Option A) so managers still see themselves correctly.

Which option (A / B / C) do you want, and should I delete or reassign the 5 Jul test row?