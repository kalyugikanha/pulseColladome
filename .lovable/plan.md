Marketing Kanban already renders `TaskDetailSheet`, which now has an Edit/Delete kebab gated to super admin, admin, task creator, or marketing dept — so the 8 Oswal tasks are already editable/deletable from that page for you.

The gap is the **Projects page** (`/projects`, "Project Management"): task chips inside each project card are static divs with no click and no menu, so the same 8 Oswal tasks (now linked to the Oswal project) have no way to open a detail view or be edited/deleted from there.

Fix, scoped to that page only:

1. `src/routes/_authenticated/projects.tsx`
   - Import `TaskDetailSheet` from `@/components/tasks/task-detail-sheet` and add local state `const [openTaskId, setOpenTaskId] = useState<string | null>(null)`.
   - Make each task chip in the kanban columns a `<button>` that calls `setOpenTaskId(t.id)` on click (keep current markup and styling, just wrap it in a full-width button with `text-left`).
   - Render `<TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />` once at the bottom of the page (next to `EditProjectDialog`).
   - After the sheet closes, invalidate the `["projects"]` query so any edit/delete/status change reflects immediately — hook this via the sheet's existing `onClose` (call `qc.invalidateQueries({ queryKey: ["projects"] })` there).

No schema, RLS, or business-logic changes. Reuses the existing detail sheet's Edit dialog and delete flow, so permissions and behavior stay consistent with Marketing Kanban.