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

  const { data: status, isLoading } = useQuery({
    queryKey: ["my-google-status"],
    queryFn: () => getStatus(),
    staleTime: 30_000,
  });

  const isFramed = typeof window !== "undefined" && window.self !== window.top;
  const isLovablePreview = typeof window !== "undefined" && /(^|\.)lovable\.app$/.test(window.location.hostname) && window.location.hostname.includes("preview");

  const navigateToGoogle = (url: string) => {
    if (isFramed) {
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) window.location.assign(url);
      return;
    }
    try {
      window.top?.location.assign(url);
    } catch {
      window.location.assign(url);
    }
  };

  const connectMut = useMutation({
    mutationFn: () => getUrl(),
    onSuccess: ({ url }) => {
      navigateToGoogle(url);
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
          <Button variant="ghost" size="sm" onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}>
            Disconnect
          </Button>
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
        <Button size="sm" onClick={() => connectMut.mutate()} disabled={connectMut.isPending}>
          {connectMut.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Opening…</> : <><ExternalLink className="h-3.5 w-3.5" />Connect Google Calendar</>}
        </Button>
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
