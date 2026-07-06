
## Why you can't edit today

In the admin **Timesheet** pivot view (Weekly / Monthly / Employee × Project) the cells are read-only "click to see daily breakdown" buttons. The pencil Edit action only exists (a) inside the drill sheet next to each already-logged entry, and (b) in the "Day" view. There is no per-row Edit affordance on the main grid, so on the pivot there is literally no button to press for another employee — even though as super admin you have permission.

Two side gaps make this worse:
- `canEdit` doesn't include `me.isAdmin`, so a plain admin can't edit either.
- Pivot cells with 0 hours don't open anything, so you can't add hours for an employee/project pair that has none yet.

## Change (frontend only)

`src/routes/_authenticated/timesheet.tsx`

1. **Widen `canEdit`** to include admins:
   `me.isSuperAdmin || me.isAdmin || me.canManageProjects || me.isDepartmentHead || me.isReportingManager`

2. **Add an "Edit day…" column** at the end of each employee row in the pivot table (visible when `canEdit`). It's a small popover with a date picker constrained to the currently selected range. Picking a date opens the existing `DayEditorSheet` for `{userId, userName, date}`.

3. **Add an "Add / edit another day"** button at the top of the drill sheet (per employee × project) with the same date picker → opens `DayEditorSheet` for a chosen day. Lets an admin add hours to a day that isn't already in the list.

4. Update the pivot description copy to mention the new Edit affordance.

## Not changing

- Database / RLS — super admin already has full ALL on `attendance_logs`; the reporting-manager / dept-head UPDATE policies cover the widened `canEdit` cases.
- Approval flow, balance/trigger logic, DayEditorSheet internals.
- `my-timesheet.tsx` (self view).

## Verify

- As super admin: on the Weekly view, each employee row shows "Edit day…" → pick a date → sheet opens with that employee's tasks → change hours → Save → toast "Saved" → pivot refreshes.
- As a plain admin (no reporting relationship): same flow now works.
- As a normal employee: no Edit column appears (unchanged).
