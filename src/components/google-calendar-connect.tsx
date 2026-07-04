import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGoogleAuthUrl, getMyGoogleStatus, disconnectGoogleCalendar } from "@/lib/google-calendar.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

const PUBLISHED_DASHBOARD_URL = "https://colladome-pulse.lovable.app/dashboard";
const TROUBLESHOOTING_DOCS_URL = "https://docs.lovable.dev/tips-tricks/troubleshooting";
const GOOGLE_OAUTH_LAUNCH_PATH = "/google-calendar-oauth-launch";

function googleOAuthLaunchUrl(authUrl: string, baseOrigin: string) {
  const launchUrl = new URL(GOOGLE_OAUTH_LAUNCH_PATH, baseOrigin || window.location.origin);
  launchUrl.searchParams.set("to", authUrl);
  return launchUrl.toString();
}

type PanelProps = {
  lastError: string | null;
  onClearError: () => void;
  isLovablePreview: boolean;
  isOAuthBlockedContext: boolean;
  origin: string;
  callbackUrl: string;
};

function GoogleTroubleshootingPanel({ lastError, onClearError, isLovablePreview, isOAuthBlockedContext, origin, callbackUrl }: PanelProps) {
  const [open, setOpen] = useState(false);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const items: Array<{ title: string; body: React.ReactNode }> = [
    {
      title: "The new tab never opened",
      body: <>Your browser blocked the popup. Click <strong>Reconnect</strong> again, and if prompted, allow popups for this site.</>,
    },
    {
      title: 'Chrome shows "accounts.google.com is blocked"',
      body: (
        <>
          Google refuses to load inside embedded app previews. Open the published dashboard in a new tab, then connect Google Calendar from there.
          {isOAuthBlockedContext && " This preview is embedded, so starting OAuth here will keep hitting the blocked page."}
          <a className="ml-1 font-medium text-primary hover:underline" href={PUBLISHED_DASHBOARD_URL} target="_blank" rel="noreferrer">
            Open published dashboard
          </a>
        </>
      ),
    },
    {
      title: 'Google shows "Access blocked" or a 403 page',
      body: (
        <>
          The Google OAuth consent screen isn&apos;t published, or this account isn&apos;t on the test-user list.
          {isLovablePreview
            ? " The Lovable preview URL is often rejected by Google — try the published app instead."
            : " Publish the consent screen or add this Google account as a test user in Google Cloud."}{" "}
          <a className="font-medium text-primary hover:underline" href={PUBLISHED_DASHBOARD_URL} target="_blank" rel="noreferrer">
            Open published dashboard
          </a>
        </>
      ),
    },
    {
      title: '"redirect_uri_mismatch" error from Google',
      body: (
        <>
          The callback URL below isn&apos;t listed under <em>Authorized redirect URIs</em> in your Google Cloud OAuth client. Add it exactly:
          <div className="mt-1 flex items-center gap-2 rounded border border-border/60 bg-background/60 p-2 font-mono text-[11px] break-all">
            <span className="flex-1">{callbackUrl}</span>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => copy(callbackUrl, "Callback URL")}
              aria-label="Copy callback URL"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      ),
    },
    {
      title: 'Stuck on "Waiting for Google authorization…"',
      body: <>The Google tab was closed before finishing, or the callback didn&apos;t reach the app. Click <strong>Reconnect</strong> to try again.</>,
    },
    {
      title: "Signed in with the wrong Google account",
      body: <>Click <strong>Reconnect</strong> — it disconnects the current account first and lets you pick a different one on the Google chooser.</>,
    },
  ];

  return (
    <div className="basis-full rounded-md border border-border/60 bg-muted/40 p-3 text-xs">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-medium text-foreground">
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
          Having trouble connecting?
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {lastError && (
        <div className="mt-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <div className="font-medium">Last error</div>
                <div className="mt-0.5 break-words font-mono text-[11px]">{lastError}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="rounded p-1 hover:bg-destructive/20"
                onClick={() => copy(lastError, "Error details")}
                aria-label="Copy error details"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-[11px] hover:bg-destructive/20"
                onClick={onClearError}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-3 text-muted-foreground">
          <ul className="space-y-3">
            {items.map((it) => (
              <li key={it.title}>
                <div className="font-medium text-foreground">{it.title}</div>
                <div className="mt-0.5">{it.body}</div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
            <div className="text-[11px]">
              Current origin: <span className="font-mono">{origin}</span>{" "}
              <span className="text-muted-foreground">({isLovablePreview ? "Lovable preview" : "published / custom"})</span>
            </div>
            <a
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              href={TROUBLESHOOTING_DOCS_URL}
              target="_blank"
              rel="noreferrer"
            >
              Troubleshooting docs <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export function GoogleCalendarConnectCard() {
  const qc = useQueryClient();
  const getUrl = useServerFn(getGoogleAuthUrl);
  const getStatus = useServerFn(getMyGoogleStatus);
  const disconnect = useServerFn(disconnectGoogleCalendar);

  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isLovablePreview, setIsLovablePreview] = useState(false);
  const [isOAuthBlockedContext, setIsOAuthBlockedContext] = useState(false);
  const [origin, setOrigin] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const pollStopAtRef = useRef<number>(0);

  const { data: status, isLoading } = useQuery({
    queryKey: ["my-google-status"],
    queryFn: () => getStatus(),
    staleTime: 30_000,
  });

  useEffect(() => {
    const embedded = window.top !== window.self;
    const lovablePreview =
      /(^|\.)(lovable\.app|lovableproject\.com)$/.test(window.location.hostname) &&
      (window.location.hostname.includes("preview") || document.referrer.includes("lovable.dev") || embedded);

    setOrigin(window.location.origin);
    setIsLovablePreview(lovablePreview);
    setIsOAuthBlockedContext(embedded && lovablePreview);
  }, []);

  const callbackUrl = origin ? `${origin}/api/public/google/callback` : "/api/public/google/callback";
  const pendingLaunchUrl = pendingUrl && origin ? googleOAuthLaunchUrl(pendingUrl, origin) : null;

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
      setLastError(null);
    }
  }, [status?.connected]);

  useEffect(() => () => stopPolling(), []);

  const openOAuth = async (opts: { disconnectFirst: boolean }) => {
    if (isOpening) return;

    setIsOpening(true);
    setPopupBlocked(false);
    setPendingUrl(null);
    setLastError(null);
    stopPolling();

    if (isOAuthBlockedContext) {
      const publishedTab = window.open(PUBLISHED_DASHBOARD_URL, "_blank", "noopener,noreferrer");
      if (!publishedTab) {
        setPopupBlocked(true);
        setLastError("Open the published dashboard in a new tab to connect Google Calendar. Google blocks OAuth inside the embedded preview.");
      } else {
        toast.info("Continue Google Calendar connection from the published dashboard tab.");
      }
      setIsOpening(false);
      return;
    }

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
          console.warn("disconnect before reconnect failed", e);
        }
        await qc.invalidateQueries({ queryKey: ["my-google-status"] });
      }

      const { url } = await getUrl();
      const launchUrl = googleOAuthLaunchUrl(url, window.location.origin);
      setPendingUrl(url);

      if (authTab && !authTab.closed) {
        authTab.location.replace(launchUrl);
        setPopupBlocked(false);
        startPolling();
      } else {
        setPopupBlocked(true);
        setLastError("Browser blocked the new tab for Google sign-in.");
      }
    } catch (e: unknown) {
      if (authTab && !authTab.closed) authTab.close();
      const message = e instanceof Error ? e.message : "Could not start Google sign-in";
      toast.error(message);
      setLastError(message);
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
      setLastError(null);
      await qc.invalidateQueries({ queryKey: ["my-google-status"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setLastError(e.message);
    },
  });

  if (isLoading) return null;

  const panel = (
    <GoogleTroubleshootingPanel
      lastError={lastError}
      onClearError={() => setLastError(null)}
      isLovablePreview={isLovablePreview}
      isOAuthBlockedContext={isOAuthBlockedContext}
      origin={origin}
      callbackUrl={callbackUrl}
    />
  );

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
                <><ExternalLink className="h-3.5 w-3.5" />{isOAuthBlockedContext ? "Open published dashboard" : "Reconnect"}</>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => disconnectMut.mutate()} disabled={busy}>
              Disconnect
            </Button>
          </div>
          {popupBlocked && pendingLaunchUrl && (
            <div className="basis-full rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <div>
                  Your browser blocked the new tab.{" "}
                  <a
                    className="font-medium text-primary hover:underline"
                    href={pendingLaunchUrl}
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
          {panel}
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
            <><ExternalLink className="h-3.5 w-3.5" />{isOAuthBlockedContext ? "Open published dashboard" : "Connect Google Calendar"}</>
          )}
        </Button>

        {pendingLaunchUrl && !popupBlocked && (
          <div className="basis-full rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Waiting for Google authorization in the new tab… this card will update automatically.</span>
            </div>
            <a className="mt-1 inline-block font-medium text-primary hover:underline" href={pendingLaunchUrl} target="_blank" rel="noopener noreferrer">
              Reopen Google sign-in
            </a>
          </div>
        )}

        {popupBlocked && pendingLaunchUrl && (
          <div className="basis-full rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <div>
                Your browser blocked the new tab.{" "}
                <a className="font-medium text-primary hover:underline" href={pendingLaunchUrl} target="_blank" rel="noopener noreferrer" onClick={() => {
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
              {isOAuthBlockedContext
                ? "Google Calendar connection must be completed from the published app. Google blocks accounts.google.com inside the embedded preview."
                : isLovablePreview
                ? "If Google shows 403 in preview, connect from the published app instead. Google may reject OAuth started from the editor preview."
                : "If Google shows 403, publish the OAuth consent screen or add this account as a test user in Google Cloud."}
              <a className="ml-1 font-medium text-primary hover:underline" href={PUBLISHED_DASHBOARD_URL} target="_blank" rel="noreferrer">
                Open published dashboard
              </a>
            </div>
          </div>
        </div>

        {panel}
      </CardContent>
    </Card>
  );
}
