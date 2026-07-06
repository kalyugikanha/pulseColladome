## Goal
Give super admins a direct "Delete permanently" action for deactivated teammates on the Directory page, so they don't have to open the edit dialog to find it.

## Current state
- `deleteUserPermanently` server fn already exists and wipes auth + all user-scoped rows. Super-admin-gated.
- The Directory edit dialog already has a "Delete permanently" button (guarded by `canHardDelete`, which is true for super admins), with an email-typing confirm dialog.
- Users deactivated via the edit dialog show up in the table only when the "Inactive" (or "All") filter is selected. There is no row-level delete affordance.

## Changes (UI only, `src/routes/_authenticated/directory.tsx`)
1. In the row Actions cell, when the viewer is a super admin (`canHardDelete`) AND the row is deactivated (`p.is_active === false`) AND it is not the viewer themselves, render a small destructive "Delete" icon button next to Edit.
2. Clicking it opens the existing `confirmDelete` dialog (reuse the current email-typing confirmation flow, `hardDelete` handler, and toast + query invalidation). No new server fn, no schema change.
3. Keep the existing button inside the edit dialog as-is for discoverability.

## Out of scope
- Bulk delete, soft-delete grace period, or exporting the user's data before deletion.
- Any change to the deletion server function or its cascading table list.
