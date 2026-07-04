## No changes needed

The database fields for social profiles and checklist confirmation timestamps are already present on `public.profiles`:

- `facebook_url`, `instagram_url`, `twitter_url`, `youtube_url`, `pinterest_url` (text, nullable)
- `social_follows_confirmed_at`, `reviews_confirmed_at` (timestamptz, nullable)

They were added in the earlier migration `20260704095823_...sql` and are already wired into `saveMyOnboarding` / `completeMyOnboarding` in `src/lib/onboarding.functions.ts` and the onboarding UI.

If you want additional fields beyond these (e.g. a separate column per review platform like Google Jaipur / Hyderabad / Glassdoor / AmbitionBox timestamps, or storing the URL the employee actually reviewed on), let me know and I'll add them. Otherwise no work is required here.