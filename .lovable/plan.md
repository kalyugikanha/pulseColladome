## Goal

Split the "Actual salary pool" top card into two cards: **Proposed salary pool** and **Actual salary pool**, matching the table columns.

## Definitions

- **Proposed salary pool**: sum of each effective employee's raw configured amount for the selected month.
  - Monthly comp → `monthly_salary` (full month, ignoring effective_from proration and unpaid leaves)
  - Hourly comp → `hourly_rate × hours_logged_this_month` (same as before — hourly has no "proposed" full-month figure)
- **Actual salary pool**: existing `totalConfiguredPool` value — pro-rated by effective_from and reduced by approved unpaid leave days.

## Implementation

In `src/routes/_authenticated/finances.tsx`:

1. Add `totalProposedPool` memo alongside `totalConfiguredPool`.
2. Change the top-cards grid from `md:grid-cols-4` to `md:grid-cols-5` (or keep 4 and wrap; I'll use 5 for a clean row on wide screens and it collapses on smaller).
3. Insert a new `StatCard` for "Proposed salary pool" before the existing Actual card.

## Scope

Single file: `src/routes/_authenticated/finances.tsx`. No schema or server-fn changes.