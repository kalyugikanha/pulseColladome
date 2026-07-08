## Add File Attachments (with preview) to Task Detail

Every user who can see a task can upload files from the task detail sheet's right-side panel. Attachments show inline previews for images and a compact card for other file types. Available on all tasks — new, edited, duplicated, recurring, workflow — since it's a property of the detail sheet itself.

### 1. Backend

New table `public.task_attachments`:
- `id uuid pk`, `task_id uuid fk → tasks(id) on delete cascade`
- `uploader_id uuid` (default `auth.uid()`)
- `file_path text` (path in the existing `task-attachments` bucket)
- `file_name text`, `content_type text`, `size_bytes bigint`
- `created_at timestamptz default now()`
- GRANTs to `authenticated` + `service_role`; RLS enabled.
- Policies:
  - SELECT: `public.can_view_task(task_id)` (existing helper)
  - INSERT: `auth.uid() = uploader_id AND public.can_view_task(task_id)`
  - DELETE: uploader OR admin/super_admin OR task creator
- Storage policies on bucket `task-attachments` (private): allow authenticated users to `SELECT`/`INSERT`/`DELETE` objects under path `tasks/{task_id}/...` when `can_view_task(task_id)` holds. Files served via signed URLs.

### 2. Server functions (`src/lib/tasks-workflow.functions.ts`)
- `listTaskAttachments({ taskId })` — returns rows joined with uploader profile; also generates signed URLs (10-min TTL) for previews.
- `deleteTaskAttachment({ id })` — removes storage object + row; authorization enforced by RLS.
- (Uploads go direct from the browser to Storage using the authed supabase client; a follow-up `insertTaskAttachment({ taskId, filePath, fileName, contentType, sizeBytes })` server fn records the row and writes a `task_activity` entry `attachment_added`.)

### 3. UI — `src/components/tasks/task-detail-sheet.tsx`
Add a new "Attachments" section inside the existing inline-affordances panel (right-side, above References / below Progress):
- Drop zone + "Upload files" button (multi-select). Uploads go to `task-attachments/tasks/{taskId}/{uuid}-{filename}` via `supabase.storage`. On success, calls `insertTaskAttachment`, then invalidates the detail query.
- Grid list of attachments:
  - Image types (`image/*`) render as a ~96px thumbnail using the signed URL, click → open in new tab.
  - PDFs → PDF icon + filename + inline "Open" link (opens signed URL).
  - Videos (`video/*`) → small `<video>` preview with `controls`.
  - Other → generic file icon + filename + size.
  - Each card shows uploader name + relative time, and a trash button visible when the current user is the uploader / admin / task creator.
- Empty state: "No attachments yet."
- Also add each attachment upload as a timeline entry (from `task_activity` kind `attachment_added`) so history reflects it.

### 4. Notes
- Not touching NewTask/EditTask dialogs — the request specifies detail view only.
- Existing per-comment attachments (`task_comment_attachments`) remain unchanged; this is a separate first-class task attachment list.
- Signed URLs regenerated on each detail refresh (10-min TTL) — sufficient for preview.

### Verification
- Open any task (regular, duplicated, recurring, workflow) → Attachments section appears in the right panel.
- Upload an image → thumbnail preview renders.
- Upload a PDF/video/other → correct preview/card.
- Non-uploader without admin rights cannot see delete button and RLS blocks direct delete.
- Timeline shows an "attachment added" entry.
