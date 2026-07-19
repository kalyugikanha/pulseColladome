import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { disconnectGoogleCalendar, getGoogleAuthUrl } from "@/lib/google-calendar.functions";

const CALLBACK_URL = "https://colladome-pulse.lovable.app/api/public/google/callback";
const ORIGIN_URL = "https://colladome-pulse.lovable.app";
const RETURNING_KEY = "gcal:returning";

export const Route = createFileRoute("/google-calendar-connect")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    reconnect: search.reconnect === "1" || search.reconnect === "true",
  }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  component: GoogleCalendarLaunchPage,
});

function GoogleCalendarLaunchPage() {
  const { reconnect } = Route.useSearch();
  const getUrl = useServerFn(getGoogleAuthUrl);
  const disconnect = useServerFn(disconnectGoogleCalendar);
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const googleCloudChecklist = useMemo(
    () => [
      `Authorized redirect URI: ${CALLBACK_URL}`,
      `Authorized JavaScript origin: ${ORIGIN_URL}`,
      "Google Calendar API enabled in the same Google Cloud project",
      "Calendar OAuth scopes include calendar.readonly and calendar.events",
      "OAuth consent screen is published, or shubham@colladome.com is added as a test user",
    ],
    [],
  );

  async function launch() {
    if (isRedirecting) return;
    setIsRedirecting(true);
    setError(null);

    try {
      if (reconnect) {
        try {
          await disconnect();
        } catch (e) {
          console.warn("Calendar reconnect cleanup failed", e);
        }
      }

      const { url } = await getUrl();

      try {
        sessionStorage.setItem(RETURNING_KEY, "1");
      } catch {
        // Ignore storage restrictions; OAuth can still continue.
      }

      window.location.replace(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not start Google Calendar connection.");
      setIsRedirecting(false);
    }
  }

  function copyCallbackUrl() {
    void navigator.clipboard?.writeText(CALLBACK_URL);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-xl shadow-elevated">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays className="h-5 w-5" />
          </div>
          <CardTitle className="font-display">Connect Google Calendar</CardTitle>
          <CardDescription>This is only for Calendar sync and booking permissions. Pulse sign-in uses the separate Google button on the sign-in page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <div className="font-medium text-foreground">Google Cloud setup check</div>
                <p className="mt-1">
                  If Google shows <span className="font-medium text-foreground">Access blocked / Error 403</span>, the callback is already accepted. Add the signed-in Google account as a test user or publish/verify the OAuth consent screen.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Before continuing, confirm these settings</div>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {googleCloudChecklist.map((item) => (
                <li key={item} className="break-words">{item}</li>
              ))}
            </ul>
          </div>

          {error ? (
            <div className="space-y-4">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-medium">Could not open Google Calendar access</div>
                    <div className="mt-1 break-words font-mono text-xs">{error}</div>
                    <div className="mt-2 text-xs text-destructive/80">
                      If Google says redirect_uri_mismatch, fix the Calendar OAuth callback. If Google says Error 403 access_denied, add the account as a test user or publish/verify the OAuth consent screen.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={launch} disabled={isRedirecting}>
              {isRedirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Continue to Google
            </Button>
            <Button variant="outline" onClick={copyCallbackUrl}>Copy callback URL</Button>
            <Button variant="ghost" asChild>
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}