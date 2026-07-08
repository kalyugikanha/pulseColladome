## Add build version label above profile in the sidebar

**Where:** `SidebarFooter` in `src/routes/_authenticated/route.tsx`. Insert a small muted "v1.0.0" line directly above the profile/sign-out row. Hidden when the sidebar is collapsed to icon mode (same pattern as the profile name).

**How the version lives in code:**
- New file `src/lib/version.ts` exporting `export const APP_VERSION = "1.0.0";`
- Sidebar imports it and renders `v{APP_VERSION}`.

**Auto-increment on publish:**
There's no build-time hook that runs on publish, so the bump happens in this workflow: every time you tell me to publish (or ship/deploy/go live), I will patch `APP_VERSION` — patch segment by default (1.0.0 → 1.0.1 → 1.0.2 …) — right before calling the publish tool. Say "bump minor" or "bump major" when you want 1.1.0 or 2.0.0 instead. Starting value is `1.0.0` as requested.

No backend or schema changes.