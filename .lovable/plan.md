Backfill `project_id = 1dba17f2-7f77-4a84-b804-00dc463ed32f` (Oswal) on the 8 Marketing Kanban tasks that currently have no project linked:

- OS0023 (edc13639-aeba-4cf6-a9ee-d70ca5c8dfd3)
- OS0024 (7a5c5578-f8d5-4525-8306-124605e752ab)
- OS0025 (b9db842d-dda1-4426-b453-74e7bcaa2cbb)
- OS0026 (ff46d4c0-c547-4e43-bf2d-69cf5bb4e53d)
- OS0027 (c72e2498-dfc5-4734-b58c-bc0d0044e575)
- OS0028 (b635c544-f675-4b00-89f8-aa8154bb85ef)
- OS0029 (32b6f6a2-8a6f-461f-afb0-ffbd51f44867)
- OS0030 (0ce81ac8-a381-4c05-b75c-1e4d5823d651)

Single `UPDATE public.tasks SET project_id = '<oswal-id>' WHERE id IN (...)` via the data-change tool. Marketing department_id remains intact; no other fields touched.

Note: there are already separate Oswal-linked duplicates for OS0023/0024/0028 in the tasks table (created earlier under project Oswal with no department). Those are left alone — this plan only backfills the 8 department=Marketing rows.