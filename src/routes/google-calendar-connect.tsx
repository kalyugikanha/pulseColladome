import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CalendarDays, Loader2 } from "lucide-react";
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
  const launchStartedRef = useRef(false);

  const googleCloudChecklist = useMemo(
    () => [
      `Authorized redirect URI: ${CALLBACK_URL}`,
      `Authorized JavaScript origin: ${ORIGIN_URL}`,
      "Google Calendar API enabled in the same Google Cloud project",
      "Calendar OAuth scopes include calendar.readonly and calendar.events",
      "OAuth consent screen published, or this Google account added as a test user",
    ],
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function launch() {
      if (launchStartedRef.current) return;
      launchStartedRef.current = true;
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
        if (cancelled) return;

        try {
          sessionStorage.setItem(RETURNING_KEY, "1");
        } catch {
          // Ignore storage restrictions; OAuth can still continue.
        }

        window.location.replace(url);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not start Google Calendar connection.");
      }
    }

    launch();

    return () => {
      cancelled = true;
    };
  }, [disconnect, getUrl, reconnect]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-xl shadow-elevated">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays className="h-5 w-5" />
          </div>
          <CardTitle className="font-display">Opening Google Calendar access</CardTitle>
          <CardDescription>This is only for Calendar sync and booking permissions. Pulse sign-in uses the separate Google button on the sign-in page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!error ? (
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Redirecting to Google…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-medium">Could not open Google Calendar access</div>
                    <div className="mt-1 break-words font-mono text-xs">{error}</div>
                    <div className="mt-2 text-xs text-destructive/80">
                      If Google says redirect_uri_mismatch, fix the Calendar OAuth callback below. This is different from Pulse Google sign-in.
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">Google Cloud checks</div>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {googleCloudChecklist.map((item) => (
                    <li key={item} className="break-words">{item}</li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => window.location.reload()}>Try again</Button>
                <Button variant="outline" asChild>
                  <Link to="/dashboard">Back to dashboard</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}