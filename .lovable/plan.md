## Goal
Rethemethe portal with the Colladome palette: Cream `#F6EFE4`, White `#FFFFFF`, Gold `#CFB755`, Deep gold `#B58F15`, Light gold `#E5D89A`, Black `#111111`.

## What changes
Only `src/styles.css`. All components already consume semantic tokens (`bg-background`, `text-foreground`, `bg-primary`, `gradient-primary`, `bg-sidebar`, etc.), so replacing the token values reskins the whole app — no per-file edits.

### Token mapping (in `:root`, expressed as oklch equivalents of the hex swatches)
- `--background` → Cream `#F6EFE4`
- `--foreground` → Black `#111111`
- `--surface` → White `#FFFFFF`
- `--surface-2` → Light gold `#E5D89A` at low weight (`#F1E6BF`-ish) for subtle panel banding
- `--card`, `--popover` → White
- `--card-foreground`, `--popover-foreground` → Black
- `--primary` → Deep gold `#B58F15` (strong contrast on cream/white; passes AA for white text)
- `--primary-foreground` → White
- `--primary-glow` → Gold `#CFB755` (used by `gradient-primary`)
- `--secondary` → Light gold `#E5D89A`
- `--secondary-foreground` → Black
- `--muted` → Cream `#F6EFE4`
- `--muted-foreground` → Warm grey around `#6B5A2A` (readable on cream)
- `--accent` → Light gold `#E5D89A`
- `--accent-foreground` → Black
- `--border`, `--input` → Warm beige `#E4D9B8` (light gold at ~65%)
- `--ring` → Deep gold `#B58F15`
- `--destructive` unchanged (red stays semantic); `--success`, `--warning` retuned to sit next to gold without clashing (olive-leaning success, amber-leaning warning)
- Charts → Deep gold, Gold, Light gold, Black, warm neutral (five-step monochrome gold ramp with black as anchor)

### Sidebar — inverted for brand recall
The sidebar becomes the "black + gold" surface so the logo and navigation read strongly against the cream body:
- `--sidebar` → Black `#111111`
- `--sidebar-foreground` → Cream `#F6EFE4`
- `--sidebar-primary` → Gold `#CFB755`
- `--sidebar-primary-foreground` → Black
- `--sidebar-accent` → `#1C1A12` (very dark warm)
- `--sidebar-accent-foreground` → Light gold `#E5D89A`
- `--sidebar-border` → `#2A2416`
- `--sidebar-ring` → Gold `#CFB755`

### Gradients & shadows
- `--gradient-primary` → linear-gradient Deep gold → Gold (drives every `gradient-primary` badge/button, `Super admin` chip, `Marketing Head` chip, etc.)
- `--gradient-surface` → cream → white for elevated panels
- `--shadow-elevated` → soft warm shadow (black at low alpha) tuned for the cream base
- `--shadow-glow` → warm gold halo instead of blue

### `.light` class
Same token block synced with the new palette (kept in case any component toggles `.light`, so it doesn't fall back to old blues).

### Dark mode
Not in scope — the palette is intentionally warm/light. The current dark defaults are removed; existing components that used dark values render on cream automatically because they read tokens.

## Verification
1. `/dashboard`, `/access`, `/timesheet`, `/calendar`, `/finances` all render on cream with gold accents; sidebar renders black with cream text and gold active state.
2. `gradient-primary` badges (Super admin, Marketing Head) show gold gradient, not blue.
3. Text contrast: black on cream (body), white on deep-gold (buttons), cream on black (sidebar) — all AA.
4. Charts and status colors (destructive/success/warning) remain legible.
5. No component file needs editing — everything flows from token changes in `src/styles.css`.
