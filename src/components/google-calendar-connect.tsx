import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyGoogleStatus, disconnectGoogleCalendar } from "@/lib/google-calendar.functions";
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
const PUBLISHED_GOOGLE_CONNECT_URL = "https://colladome-pulse.lovable.app/google-calendar-connect";
const GOOGLE_CALENDAR_ORIGIN = "https://colladome-pulse.lovable.app";
const GOOGLE_CALENDAR_CALLBACK_URL = "https://colladome-pulse.lovable.app/api/public/google/callback";
const TROUBLESHOOTING_DOCS_URL = "https://docs.lovable.dev/tips-tricks/troubleshooting";
const RETURNING_KEY = "gcal:returning";

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
      title: "Nothing happened when I clicked Connect",
      body: <>Your browser may have blocked the navigation to accounts.google.com. Click <strong>Connect</strong> again, and allow the redirect if prompted.</>,
    },
    {
      title: 'Chrome shows "accounts.google.com is blocked" (ERR_BLOCKED_BY_RESPONSE)',
      body: (
        <>
          In this Calendar flow, that page can hide Google&apos;s <strong>redirect_uri_mismatch</strong> error. Add the exact callback URL below in Google Cloud.
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
          The callback URL below must be listed under <em>Authorized redirect URIs</em> in your Google Cloud OAuth client. Add it exactly:
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
          <div className="mt-2">
            Also add this under <em>Authorized JavaScript origins</em>:
          </div>
          <div className="mt-1 flex items-center gap-2 rounded border border-border/60 bg-background/60 p-2 font-mono text-[11px] break-all">
            <span className="flex-1">{GOOGLE_CALENDAR_ORIGIN}</span>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => copy(GOOGLE_CALENDAR_ORIGIN, "JavaScript origin")}
              aria-label="Copy JavaScript origin"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      ),
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
  const getStatus = useServerFn(getMyGoogleStatus);
  const disconnect = useServerFn(disconnectGoogleCalendar);

  const [isOpening, setIsOpening] = useState(false);
  const [isLovablePreview, setIsLovablePreview] = useState(false);
  const [isOAuthBlockedContext, setIsOAuthBlockedContext] = useState(false);
  const [origin, setOrigin] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["my-google-status"],
    queryFn: () => getStatus(),
    staleTime: 30_000,
  });

  useEffect(() => {
    const embedded = window.top !== window.self;
    const previewHost = window.location.hostname.includes("preview") || window.location.hostname.includes("lovableproject.com");
    const lovablePreview =
      /(^|\.)(lovable\.app|lovableproject\.com)$/.test(window.location.hostname) &&
      (previewHost || embedded);

    setOrigin(window.location.origin);
    setIsLovablePreview(lovablePreview);
    setIsOAuthBlockedContext(embedded && lovablePreview);

    // If we're returning from Google, refresh status.
    try {
      if (sessionStorage.getItem(RETURNING_KEY)) {
        sessionStorage.removeItem(RETURNING_KEY);
        qc.invalidateQueries({ queryKey: ["my-google-status"] });
      }
    } catch {
      // ignore storage errors
    }
  }, [qc]);

  const callbackUrl = GOOGLE_CALENDAR_CALLBACK_URL;

  const openOAuth = async (opts: { disconnectFirst: boolean }) => {
    if (isOpening) return;
    setIsOpening(true);
    setLastError(null);

    // Embedded Lovable preview: Google will refuse to load in the iframe.
    // Send the user to the published dashboard to complete the flow there.
    if (isLovablePreview) {
      const publishedTab = window.open(PUBLISHED_GOOGLE_CONNECT_URL, "_blank", "noopener,noreferrer");
      if (!publishedTab) {
        setLastError("Open the published Google Calendar connection page in a new tab. Google blocks OAuth inside embedded preview contexts.");
      } else {
        toast.info("Continue Google Calendar connection from the published dashboard tab.");
      }
      setIsOpening(false);
      return;
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

      try {
        sessionStorage.setItem(RETURNING_KEY, "1");
      } catch {
        // ignore storage errors
      }

      const launchUrl = opts.disconnectFirst ? "/google-calendar-connect?reconnect=1" : "/google-calendar-connect";

      // Top-level navigation to an app route first. That route starts Google
      // from a full browser tab, avoiding embedded accounts.google.com loads.
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.href = launchUrl;
          return;
        }
      } catch {
        // Cross-origin top — fall through to same-window navigation.
      }
      window.location.href = launchUrl;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not start Google sign-in";
      toast.error(message);
      setLastError(message);
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
            <><ExternalLink className="h-3.5 w-3.5" />{isLovablePreview ? "Open published dashboard" : "Reconnect"}</>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => disconnectMut.mutate()} disabled={busy}>
              Disconnect
            </Button>
          </div>
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
            <><ExternalLink className="h-3.5 w-3.5" />{isLovablePreview ? "Open published dashboard" : "Connect Google Calendar"}</>
          )}
        </Button>

        <div className="basis-full rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <div>
              {isOAuthBlockedContext
                ? "Google Calendar connection must be completed from the published app. Google blocks accounts.google.com inside the embedded preview."
                : isLovablePreview
                ? "If Google shows 403 in preview, connect from the published app instead. Google may reject OAuth started from the editor preview."
                : "Clicking Connect will send you to Google to sign in, then return here. If Google still shows the blocked page, add the exact callback URL in Google Cloud's Authorized redirect URIs."}
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
