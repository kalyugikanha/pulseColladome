import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";

export const Route = createFileRoute("/google-calendar-oauth-launch")({
  ssr: false,
  validateSearch: (search) => ({
    to: typeof search.to === "string" ? search.to : "",
  }),
  component: GoogleCalendarOAuthLaunch,
});

function safeGoogleAuthUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname !== "accounts.google.com") return null;
    if (parsed.pathname !== "/o/oauth2/v2/auth") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function GoogleCalendarOAuthLaunch() {
  const { to } = Route.useSearch();
  const authUrl = safeGoogleAuthUrl(to);

  useEffect(() => {
    if (!authUrl) return;
    window.location.replace(authUrl);
  }, [authUrl]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-elevated">
        {authUrl ? (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <h1 className="mt-4 font-display text-xl font-semibold">Opening Google Calendar</h1>
            <p className="mt-2 text-sm text-muted-foreground">This window will continue to Google sign-in.</p>
            <a className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline" href={authUrl} rel="noreferrer">
              Continue to Google <ExternalLink className="h-4 w-4" />
            </a>
          </>
        ) : (
          <>
            <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
            <h1 className="mt-4 font-display text-xl font-semibold">Google sign-in link expired</h1>
            <p className="mt-2 text-sm text-muted-foreground">Return to the dashboard and start the Google Calendar connection again.</p>
          </>
        )}
      </div>
    </main>
  );
}