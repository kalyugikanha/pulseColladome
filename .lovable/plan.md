Plan:

1. Fix Kanishka’s approved task hours in Team Timesheet
- Treat approved task activity as a first-class day entry, not a separate/test panel.
- Store/display task activity by the user’s selected/local work date so a task closed late evening does not land on the previous UTC date.
- In the day panel, show the approved amount for approved task activity. Example: if Kanishka logged 2 hours and 1 hour was approved, the row should show 1.0 approved hour for that project/task, not 0 and not the full 2 unless all 2 were approved.
- Make status per task-derived row reflect the task-hour approval status, instead of relying only on whether an attendance log day was approved.
- Keep the same visibility rules as the pending approvals panel: admins/project managers see scoped/all rows; reporting managers see direct reports.
- After approval/rejection, invalidate/refetch the team timesheet day rows so the below panel updates immediately.

2. Update existing task-hour records date handling
- Ensure new task-completion time logs use the intended work date consistently.
- For already-created rows affected by the UTC/local mismatch, include a safe fallback in the Team Timesheet query so recently approved activity appears on the expected local day.

3. Finance module: include Salaries and Project Burn clearly
- Keep Salaries inside the Finance module.
- Keep/add Project Burn inside Finance as an integrated section so finance admins can see salaries, salary pool, allocated burn, unallocated salary, and burn by project in one place.
- Ensure the Finance sidebar entry is the primary place for these finance views; avoid making users hunt for Project Burn under Projects.

4. Workflow module: add Project ID / project picker
- Add project selection where workflows are started, showing project code/ID plus project name.
- Ensure workflow-created tasks and subsequent stages keep the selected project ID through the workflow chain.
- If needed, also show the linked project code/ID in the workflow/task UI so it is clear which project the workflow belongs to.

Technical notes:
- The main timesheet files to adjust are `src/routes/_authenticated/timesheet.tsx` and the task workflow time logging path in `src/lib/workflows.functions.ts` / `src/components/tasks/workflow-task-panel.tsx` if a work-date input is needed.
- Finance changes are in `src/routes/_authenticated/finances.tsx`, with possible navigation cleanup in `src/routes/_authenticated/route.tsx`.
- Workflow project picker changes are in `src/routes/_authenticated/tasks.tsx`; workflow persistence already accepts `projectId`, so this is mostly improving the UI and display.