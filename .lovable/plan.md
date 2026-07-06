# Google-only Sign-in

Simplify `src/routes/auth.tsx` so employees can only sign in with Google.

## Changes (frontend only, `src/routes/auth.tsx`)

- Remove the email/password Tabs (Sign in + Create account), the `handleEmail` function, and related state (`mode`, `email`, `password`, `fullName`).
- Keep only the "Continue with Google" button (existing `handleGoogle` flow via `lovable.auth.signInWithOAuth("google", ...)`).
- Replace the current helper copy with a clear prompt:
  > "Please sign in with your **@colladome.com** Google account. If you don't have one yet, please check with HR."
- Add a small secondary note that Google Calendar sync is still connected separately from the Team Calendar page (kept from current copy).
- Update `CardTitle` / `CardDescription` to match ("Sign in to Pulse" / "Google sign-in only — use your Colladome Google account.").
- Remove now-unused imports: `Input`, `Label`, `Tabs*`, `supabase` (only used by removed email flow), `Activity`.

## Not changing

- Auth backend, Google OAuth config, provider settings, or any other route.
- Existing users signed in via email/password continue to work; they simply have no UI to sign in that way here. (If you also want to disable the email provider entirely at the backend level, say so and I'll add that step.)
