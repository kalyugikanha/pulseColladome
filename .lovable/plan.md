## Why the version isn't changing

`src/lib/version.ts` is a hand-edited constant (`APP_VERSION = "1.0.1"`). Nothing in the build or publish flow bumps it — publishing just deploys whatever string is in the file. So unless I edit it, publishing won't change what you see.

Two things to fix that:

### 1. Auto-inject a build ID at build time
Add a `define` in `vite.config.ts` so every build stamps in a fresh identifier:

```ts
define: {
  __BUILD_ID__: JSON.stringify(new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)),
}
```

Expose it from `src/lib/version.ts` as `BUILD_ID` (typed via `src/vite-env.d.ts`). The footer in `src/routes/_authenticated/route.tsx` renders `v{APP_VERSION} · {BUILD_ID}` — e.g. `v1.0.2 · 202607081345`. Now every publish visibly changes even without a manual bump.

### 2. Bump the semver now
Set `APP_VERSION` to `"1.0.2"` so the visible number moves too.

Going forward: the build ID auto-changes on every publish (no action needed). Say "bump version" when you want the semver to move — I'll do a patch bump by default, or you can say "bump minor/major".

### Files
- `vite.config.ts`: add `vite.define` for `__BUILD_ID__`.
- `src/vite-env.d.ts`: declare `const __BUILD_ID__: string`.
- `src/lib/version.ts`: bump to `1.0.2`, export `BUILD_ID = __BUILD_ID__`.
- `src/routes/_authenticated/route.tsx`: render `v{APP_VERSION} · {BUILD_ID}`.

Also quietly fixing the hydration warning on `/` caused by locale-dependent date formatting ("Wednesday 8 July" vs "Wednesday, July 8") by rendering the formatted date only after mount.
