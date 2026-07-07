## Restrict welcome overlay to the live URL only

Right now the first-login welcome overlay fires on any host — preview and production. Gate it so it only shows when the app is running on `colladome-pulse.lovable.app` (or its custom domain, if one is added later).

### Change
In `src/hooks/useFirstLoginWelcome.ts`, before running the profile check, verify the current host is the production host:

```ts
const host = typeof window !== "undefined" ? window.location.hostname : "";
const isLive = host === "colladome-pulse.lovable.app";
if (!isLive) return; // skip preview / localhost / *id-preview*.lovable.app
```

Effect:
- `id-preview--…lovable.app` → no overlay, no DB write.
- `localhost` → no overlay.
- `colladome-pulse.lovable.app` → overlay shows once per user (unchanged behavior).

Nothing else changes — DB column, backfill, and component stay as-is. This also means when a user's first-ever login happens on the live URL, `welcomed_at` gets stamped there and they won't re-see it on preview later either.

### Verify
- Load preview URL as a fresh user → no overlay.
- Load `https://colladome-pulse.lovable.app` as a fresh user → overlay + confetti, dismiss persists.
