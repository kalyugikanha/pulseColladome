## Goal
Redesign the Team Timesheet so nothing overflows and hour figures are the first thing you read. Two panels get reworked: the "Task hours awaiting approval" table and the day-breakdown table.

## Problems today
- Pending panel is a 7-column table (Employee · Task · Date · Logged · Approve input · Note · Action). At ~1180px the Action column can't fit "Approve" + "Reject" labels so the button text clips into the cell edge.
- Hour values render as plain 8px-cell `font-mono` in small columns — visually indistinguishable from the surrounding text.
- Day-breakdown table has 6 columns with rowspan employee cells; on mid widths Project + Notes squeeze the Hours cell.
- Filter bar wraps aggressively and pushes the tables down.

## Redesign — Pending panel (card list, not table)
Replace the `<Table>` with a responsive card list, one card per pending entry:

```text
┌───────────────────────────────────────────────────────────────┐
│ Kanishka Sharma                            [3 Jul, Fri]  ⋯    │
│ Fix onboarding banner                                          │
│ SG-042 · Sacred Groves                                         │
│                                                                │
│  Logged           Approve                                      │
│  2.00 h           [ 2.00 ] h                                   │
│                                                                │
│  Note: "Handoff from Ravi, needs QA"                           │
│                                                                │
│                           [ Reject ]  [ ✓ Approve 2h ]         │
└───────────────────────────────────────────────────────────────┘
```

- Hours use `text-2xl font-semibold tabular-nums` so Logged and Approve values dominate the card.
- Approve button label absorbs the value: `Approve 2.0h` — no separate cryptic column.
- Reject stays as a ghost/destructive text button; when the card is < 480px both buttons collapse to icon+tooltip.
- Amber inline warning when approving less than logged remains, right under the input.
- Cards flow one-per-row up to `md`, then two-column grid from `lg` up so the panel keeps scanning quickly on wide screens.

## Redesign — Day breakdown table
Keep the table (it's the right shape) but tighten the columns and give hours real presence:

- Merge Project + Notes into a single left-heavy cell (Project on line 1, Notes muted on line 2). That removes one column.
- New column order: Employee · Project & Notes · Hours · Status · ⋯
- Hours cell: `text-lg font-semibold tabular-nums`, right-aligned, subtle right border so the number reads as a data column.
- Employee cell (rowspan): name, dept, and a bold `Total: 6.5h` chip using the same numeric treatment.
- Status pills stay but move to a fixed 96px column with icon-only variants when the label would clip.
- Row action `⋯` moves out of the last cell into an absolute-positioned button on hover for cleaner rows on wide screens; still tappable on touch.
- Day total footer row uses the same big numeric style, plus a right-aligned "Approved X.X / Logged Y.Y" ratio.

## Filter bar polish
- Group the day navigator (◀ [date] ▶ Today) into a single pill so it doesn't fight the filters for space.
- Filter chips (Department / Employee / Projects) collapse into a single "Filters" dropdown below `md`, keeping the header to one line on narrow screens.
- Export CSV stays on the right, icon-only under `md`.

## No behaviour changes
Approval logic, visibility scopes, queries, and CSV export stay exactly as today — this is a presentation rework of `TimesheetPage`, `PendingRow`, and `EmployeeBlock` only.

## Files touched
- `src/routes/_authenticated/timesheet.tsx` — swap Pending table for card grid, restructure day table columns, tighten header/filter bar, apply tabular-nums numeric style throughout.
