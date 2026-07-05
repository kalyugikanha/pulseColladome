## Changes to `src/routes/_authenticated/project-burn.tsx`

1. **Remove the "Burn by project" card** entirely (the table between the daily trend chart and the daily log).

2. **Fix the "Daily burn / Daily hours" chart not reacting to month/project filters**:
   - Ensure the chart's data source (`dailyTrend`) is derived from `filteredDaily` (already is) but also recomputes correctly when `projectFilter`, `deptSel`, and `month` change.
   - Recompute `trendMax` from the currently displayed metric (burn vs hours) so bars rescale when switching filters/months, instead of using a stale burn-only max.
   - Reset `projectFilter` to `"all"` when the selected project no longer exists in the new month's data (prevents an empty chart when the previously chosen project has no entries in the new month).

3. Keep the top stat cards and the Daily log table unchanged in behavior; just drop references to `byProject` where they were only used for the removed card. Keep "Active projects" stat by computing it from `deptFilteredDaily` directly.

No DB or server changes.
