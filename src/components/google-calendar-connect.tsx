import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGoogleAuthUrl, getMyGoogleStatus, disconnectGoogleCalendar } from "@/lib/google-calendar.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CalendarDays, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

const PUBLISHED_DASHBOARD_URL = "https://colladome-pulse.lovable.app/dashboard";

export function GoogleCalendarConnectCard() {
  const qc = useQueryClient();
  const getUrl = useServerFn(getGoogleAuthUrl);
  const getStatus = useServerFn(getMyGoogleStatus);
  const disconnect = useServerFn(disconnectGoogleCalendar);

  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isLovablePreview, setIsLovablePreview] = useState(false);
  const pollRef = useRef<number | null>(null);
  const pollStopAtRef = useRef<number>(0);

  const { data: status, isLoading } = useQuery({
    queryKey: ["my-google-status"],
    queryFn: () => getStatus(),
    staleTime: 30_000,
  });

  useEffect(() => {
    setIsLovablePreview(
      /(^|\.)lovable\.app$/.test(window.location.hostname) && window.location.hostname.includes("preview"),
    );
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    pollStopAtRef.current = Date.now() + 2 * 60 * 1000; // 2 minutes
    pollRef.current = window.setInterval(async () => {
      if (Date.now() > pollStopAtRef.current) {
        stopPolling();
        return;
      }
      await qc.invalidateQueries({ queryKey: ["my-google-status"] });
    }, 3000);
  };

  useEffect(() => {
    if (status?.connected) {
      stopPolling();
      setPendingUrl(null);
      setPopupBlocked(false);
    }
  }, [status?.connected]);

  useEffect(() => () => stopPolling(), []);

  const openOAuth = async (opts: { disconnectFirst: boolean }) => {
    if (isOpening) return;

    setIsOpening(true);
    setPopupBlocked(false);
    setPendingUrl(null);
    stopPolling();

    const authTab = window.open("about:blank", "_blank");
    if (authTab) {
      authTab.document.write(
        "<!doctype html><title>Opening Google</title><body style='font-family:system-ui,sans-serif;padding:24px'>Opening Google sign-in…</body>",
      );
    }

    try {
      if (opts.disconnectFirst) {
        try {
          await disconnect();
        } catch (e) {
          // Non-fatal: continue to OAuth so user can re-link even if row was already gone.
          console.warn("disconnect before reconnect failed", e);
        }
        await qc.invalidateQueries({ queryKey: ["my-google-status"] });
      }

      const { url } = await getUrl();
      setPendingUrl(url);

      if (authTab && !authTab.closed) {
        authTab.location.replace(url);
        setPopupBlocked(false);
        startPolling();
      } else {
        setPopupBlocked(true);
      }
    } catch (e: unknown) {
      if (authTab && !authTab.closed) authTab.close();
      const message = e instanceof Error ? e.message : "Could not start Google sign-in";
      toast.error(message);
      await qc.invalidateQueries({ queryKey: ["my-google-status"] });
    } finally {
      setIsOpening(false);
    }
  };

  const handleConnect = () => openOAuth({ disconnectFirst: false });
  const handleReconnect = () => openOAuth({ disconnectFirst: true });

  const disconnectMut = useMutation({
    mutationFn: () => disconnect(),
    onSuccess: async () => {
      toast.success("Disconnected Google Calendar");
      await qc.invalidateQueries({ queryKey: ["my-google-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return null;

  if (status?.connected) {
    const busy = isOpening || disconnectMut.isPending;
    return (
      <Card className="border-success/30 bg-success/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <div>
              <div className="font-medium">Google Calendar connected</div>
              <div className="text-xs text-muted-foreground">{status.google_email}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleReconnect} disabled={busy}>
              {isOpening ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Reconnecting…</>
              ) : (
                <><ExternalLink className="h-3.5 w-3.5" />Reconnect</>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => disconnectMut.mutate()} disabled={busy}>
              Disconnect
            </Button>
          </div>
          {popupBlocked && pendingUrl && (
            <div className="basis-full rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <div>
                  Your browser blocked the new tab.{" "}
                  <a
                    className="font-medium text-primary hover:underline"
                    href={pendingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      setPopupBlocked(false);
                      startPolling();
                    }}
                  >
                    Open Google sign-in in a new tab
                  </a>.
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }


  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <div>
            <div className="font-medium">Connect your Google Calendar</div>
            <div className="text-xs text-muted-foreground">Let super admins see your upcoming meetings.</div>
          </div>
        </div>
        <Button size="sm" onClick={handleConnect} disabled={isOpening}>
          {isOpening ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" />Opening…</>
          ) : (
            <><ExternalLink className="h-3.5 w-3.5" />Connect Google Calendar</>
          )}
        </Button>

        {pendingUrl && !popupBlocked && (
          <div className="basis-full rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Waiting for Google authorization in the new tab… this card will update automatically.</span>
            </div>
            <a className="mt-1 inline-block font-medium text-primary hover:underline" href={pendingUrl} target="_blank" rel="noopener noreferrer">
              Reopen Google sign-in
            </a>
          </div>
        )}

        {popupBlocked && pendingUrl && (
          <div className="basis-full rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <div>
                Your browser blocked the new tab. {" "}
                <a className="font-medium text-primary hover:underline" href={pendingUrl} target="_blank" rel="noopener noreferrer" onClick={() => {
                  setPopupBlocked(false);
                  startPolling();
                }}>
                  Open Google sign-in in a new tab
                </a>.
              </div>
            </div>
          </div>
        )}

        <div className="basis-full rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <div>
              {isLovablePreview
                ? "If Google shows 403 in preview, connect from the published app instead. Google may reject OAuth started from the editor preview."
                : "If Google shows 403, publish the OAuth consent screen or add this account as a test user in Google Cloud."}
              <a className="ml-1 font-medium text-primary hover:underline" href={PUBLISHED_DASHBOARD_URL} target="_blank" rel="noreferrer">
                Open published dashboard
              </a>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
