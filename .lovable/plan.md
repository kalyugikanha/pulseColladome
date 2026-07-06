
## What's actually happening on June 30

I checked the database. Bilu's June upload IS there — e.g. Aakash on **2026-06-30** has 25 task entries totalling hundreds of hours, all approved. Nothing is lost.

Why you can't see them when you "edit Akash":
- Today is **6 July 2026**, so the Timesheet opens on **Month = July 2026** by default.
- The "Edit day…" popover is constrained to the currently selected range (July 1 – July 31), so **June dates are disabled** in that mini calendar.
- To reach June 30 today you'd have to: change Month dropdown → June → then click Edit day → pick 30. That's the "clumsy UX" you're describing.

So the data is fine — the UI is forcing you through Month → Range → Cell → Popover → Day just to touch one day.

## Walk-through of the two edit scenarios today (for context)

- **Single day for one employee**: pick Month → pick Employee row → click "Edit day…" popover → pick a date inside that month → DayEditorSheet opens with that day's project/hours rows.
- **Bulk month for many employees**: no real bulk editor exists. You'd have to open each employee × each day one at a time. Bilu's June upload didn't happen through this UI — it was a direct DB seed.

## Proposed redesign — daily-only, Clockify-style

Remove Month / Range views from the Admin Timesheet. Keep **one** primary surface: a **Day view** that always answers "what did everyone do on this date?" and lets you edit inline.

### Layout

```text
┌─ Timesheet ────────────────────────────────────────────────┐
│  ◀  Mon, 30 Jun 2026  ▶     [📅 Jump to date]              │
│  Dept ▾   Employee ▾   Projects ▾        [Export CSV]      │
├────────────────────────────────────────────────────────────┤
│ Employee     │ Project                │ Hrs │ Notes │ ✓ │ ⋯│
│ Aakash       │ CLDM00524 Selfup       │ 30  │ …     │ ✅ │✎│
│ Aakash       │ CLDM00418 Bus Arabia   │ 20  │ …     │ ✅ │✎│
│              │ + Add project…                            │
│ Anjali       │ CLDM00522 Oswal        │ 20  │ June w│ ✅ │✎│
│ Deepak       │ CLDM00481 Briskon      │ 45  │ June w│ ✅ │✎│
│  …                                                         │
│ Day total: 1,284 hrs · 18 employees · 42 project rows       │
└────────────────────────────────────────────────────────────┘
```

### Interactions

- **Date navigation**: prev / next day arrows + a "Jump to date" popover (unbounded calendar, no per-month gating). URL keeps `?date=YYYY-MM-DD` so it's shareable/refreshable.
- **Employee grouping**: rows grouped by employee, sub-rows per project entry for that day, then a "+ Add project" ghost row per employee to add another line (project select + hours + notes).
- **Inline edit** (admin/super-admin): hours & notes are editable in-place; project is a dropdown. Save on blur / Enter with a toast.
- **Row menu (⋯)**: Delete entry, Approve/Unapprove day, "Open full editor" (still opens the existing `DayEditorSheet` for power edits).
- **Day approval**: single ✅ per employee-day (same `attendance_logs.approved_at` we use now); one-click toggle.
- **Filters**: Department, Employee, Projects — same MultiSelectFilter, applied client-side to the day's rows.
- **Empty employees**: option "Show employees with no entries" so you can add hours for someone who didn't log anything that day.
- **Export CSV**: exports the currently visible day.

### What gets removed

- Month view, Range view, ViewMode switch, month/year selects, range pickers.
- `EditDayPopover` (the constrained mini calendar) — replaced by the always-available date navigator.
- Pivot table Employee × Project. (See below if you want a summary.)

### Monthly totals — optional secondary tab

Clockify keeps daily entry primary but still has reports. Recommended: a small **"Reports"** sub-tab (read-only) with the old Employee×Project pivot for a chosen month, purely for export/summary — no edit affordances. Say the word if you want this included; otherwise we drop it entirely.

### No database / policy changes

RLS on `attendance_logs` already lets super-admins & admins update `tasks`, `total_hours`, `last_edited_by`, `approved_at`. Inline edits reuse the same update path as `DayEditorSheet.save()`. Employee timesheet page (`my-timesheet.tsx`), approvals flow, leave, and dashboards are untouched.

## Files that change

- `src/routes/_authenticated/timesheet.tsx` — rewritten around a single Day view + inline row editor.
- `src/components/day-editor-sheet.tsx` — kept as-is; still opened from the "Open full editor" menu item.
- (Optional) `src/components/timesheet-day-row.tsx` — new small component for the inline-editable row, to keep the route file readable.

## Open question before I build

Do you want the **Reports (monthly pivot, read-only)** sub-tab kept for month-end export, or drop it entirely and rely on CSV export of individual days? Reply "keep reports" or "drop reports" and I'll finalise.
