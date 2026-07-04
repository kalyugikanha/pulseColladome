import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { getGoogleAuthUrl, getMyGoogleStatus, disconnectGoogleCalendar } from "@/lib/google-calendar.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function GoogleCalendarConnectCard() {
  const qc = useQueryClient();
  const getUrl = useServerFn(getGoogleAuthUrl);
  const getStatus = useServerFn(getMyGoogleStatus);
  const disconnect = useServerFn(disconnectGoogleCalendar);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["my-google-status"],
    queryFn: () => getStatus(),
    staleTime: 30_000,
  });

  const connectMut = useMutation({
    mutationFn: () => getUrl(),
    onSuccess: ({ url }) => {
      const w = window.open(url, "google-oauth", "width=520,height=680");
      popupRef.current = w;
      if (!w) {
        window.location.href = url;
        return;
      }
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        if (w.closed) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          await qc.invalidateQueries({ queryKey: ["my-google-status"] });
        }
      }, 800) as unknown as number;
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

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

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
          {connectMut.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Opening…</> : "Connect Google Calendar"}
        </Button>
      </CardContent>
    </Card>
  );
}
