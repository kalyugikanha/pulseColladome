## Add "Estimated hours" to the Marketing Kanban → New task dialog

The estimate field already exists on the standalone Tasks page dialog and on the Edit dialogs, but the **New Marketing task** popup (opened from the "New task" button on `/marketing-kanban`) was missing it. That's the popup you're on.

### Change

In `src/routes/_authenticated/marketing-kanban.tsx`, inside `NewMarketingTaskDialog`:

1. Add `const [estimatedHours, setEstimatedHours] = useState<string>("");`
2. Reset it in the existing `useEffect` open-reset block.
3. Add a numeric input next to "Internal deadline" / "Scheduled post date" row (or below it):
   - Label: **Estimated hours**
   - `type="number"`, `min=0`, `step=0.25`, placeholder "e.g. 4"
4. In `submit()`, validate: if provided, must be a positive number, else `toast.error("Estimated hours must be a positive number.")`. Include `estimated_hours: estimatedHours ? Number(estimatedHours) : null` in the insert `payload`.

No schema changes (column already exists), no changes to move/timesheet logic, no other files touched.