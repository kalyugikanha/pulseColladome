## Add silent auto-save to the employee onboarding form

The self-onboarding form (`src/routes/_authenticated/complete-onboarding.tsx`) is long and today only persists when the user clicks **Save progress** or **Submit**. Any refresh, tab close, or navigation before that loses everything typed.

Add a soft, background auto-save so every field change is quietly persisted to the user's own draft, without changing the visible flow.

### Behaviour

- Debounced auto-save fires ~800 ms after the last keystroke / date-picker / time-picker change on any of the text/date/time/textarea fields (personal, work preferences, bank).
- Uses the existing `saveMyOnboarding` server function — same shape, same auth, so it also serves as the "session-attached" store (rows are keyed by `auth.uid()`).
- Skipped while the initial `getMyOnboarding` query is still loading, so hydrating the form doesn't cause a phantom write-back.
- Skipped for submitted-and-approved records only when the user is a read-only viewer; here everyone can edit, so auto-save stays on for approved profiles too (matches current Save behaviour).
- Also fires on `beforeunload` via a `navigator.sendBeacon`-style final flush attempt (best-effort, non-blocking) so a tab close still captures the latest text.
- Document uploads already persist immediately — no change there.

### UI

- Replace the "Save progress" button's role: keep it as an optional manual trigger, but add a small right-aligned status pill next to it — `Saved`, `Saving…`, or `Unsaved changes` (with timestamp on hover). No toasts on auto-save success; toast only on failure (rate-limited to one per 30 s so we don't spam if the network is flaky).
- Submit button behaviour unchanged.

### Implementation notes

- Add a `useAutoSave` hook local to the file (or `src/hooks/use-auto-save.ts` if it's reusable) that takes the serialized field payload plus a save function; internally uses `useEffect` + `setTimeout` + a `useRef` to skip the first hydration render and to cancel in-flight timers.
- Track `dirty` and `lastSavedAt` state; drive the status pill from it.
- Guard against concurrent writes by tracking an `inFlight` ref — if a change lands while one is in-flight, schedule another after it resolves.
- No schema or RLS change needed — `saveMyOnboarding` already writes to the user's profile + bank rows via `requireSupabaseAuth`.

### Files touched

- `src/routes/_authenticated/complete-onboarding.tsx` — wire the debounced auto-save, status pill, and `beforeunload` flush; leave field markup and validation intact.
- (optional) `src/hooks/use-auto-save.ts` — small reusable hook if we want to reuse elsewhere.

### Out of scope

- HR-side onboarding form in `src/routes/_authenticated/onboarding.tsx` (that's a create-user flow, not a long-form draft).
- Server-side changes to `saveMyOnboarding` — the existing function already handles partial saves.
