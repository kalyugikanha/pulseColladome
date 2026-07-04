import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTeamGoogleStatuses, listUserUpcomingEvents } from "@/lib/google-calendar.functions";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Video, MapPin, Users2, RefreshCw, ExternalLink, AlertCircle } from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";

export const Route = createFileRoute("/_authenticated/meetings")({
  component: MeetingsPage,
});

function MeetingsPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const listStatuses = useServerFn(listTeamGoogleStatuses);
  const listEvents = useServerFn(listUserUpcomingEvents);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);

  if (!me?.isSuperAdmin) {
    return (
      <div className="mx-auto max-w-md text-center py-16">
        <h1 className="font-display text-2xl font-bold">Restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">Only super admins can view team meetings.</p>
      </div>
    );
  }

  const { data: team, isLoading: teamLoading } = useQuery({
    queryKey: ["team-google-statuses"],
    queryFn: () => listStatuses(),
    staleTime: 30_000,
  });

  const effectiveId = selectedUserId ?? team?.[0]?.user_id;
  const selected = useMemo(() => (team ?? []).find((t) => t.user_id === effectiveId), [team, effectiveId]);

  const { data: events, isFetching, refetch } = useQuery({
    queryKey: ["team-google-events", effectiveId],
    enabled: !!effectiveId,
    queryFn: () => listEvents({ data: { userId: effectiveId!, days: 7 } }),
    staleTime: 60_000,
  });

  const connectedCount = (team ?? []).filter((t) => t.connected).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Team Meetings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Google Calendar events for the next 7 days · {connectedCount}/{team?.length ?? 0} connected
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ["team-google-events", effectiveId] }); refetch(); }} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Select a team member</CardTitle>
          <CardDescription>Only members who connected Google Calendar will show events.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={effectiveId} onValueChange={(v) => setSelectedUserId(v)} disabled={teamLoading}>
            <SelectTrigger className="w-full md:w-[420px]">
              <SelectValue placeholder="Choose a user" />
            </SelectTrigger>
            <SelectContent>
              {(team ?? []).map((t) => (
                <SelectItem key={t.user_id} value={t.user_id}>
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span className="truncate">{t.full_name ?? t.email}</span>
                    <Badge variant={t.connected ? "default" : "secondary"} className="ml-2 text-[10px]">
                      {t.connected ? "connected" : "not connected"}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selected && !selected.connected && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertCircle className="h-4 w-4 text-warning mt-0.5" />
            <div>
              <div className="font-medium">{selected.full_name ?? selected.email} hasn't connected Google Calendar yet.</div>
              <div className="text-muted-foreground mt-0.5">Ask them to sign in and click <em>Connect Google Calendar</em> on their dashboard.</div>
            </div>
          </CardContent>
        </Card>
      )}

      {events?.error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
            <div>{events.error}</div>
          </CardContent>
        </Card>
      )}

      {selected?.connected && (
        <EventsList events={events?.events ?? []} loading={isFetching} />
      )}
    </div>
  );
}

function EventsList({ events, loading }: { events: import("@/lib/google-calendar.server").CalendarEvent[]; loading: boolean }) {
  const groups = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const e of events) {
      const key = format(new Date(e.start), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  if (loading && events.length === 0) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading meetings…</CardContent></Card>;
  }
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          <CalendarDays className="mx-auto h-6 w-6 mb-2 opacity-60" />
          No meetings in the next 7 days.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([day, dayEvents]) => {
        const d = new Date(day);
        const label = isToday(d) ? "Today" : isTomorrow(d) ? "Tomorrow" : format(d, "EEEE, MMM d");
        return (
          <div key={day}>
            <div className="mb-2 flex items-center gap-2">
              <div className="font-display text-sm font-semibold">{label}</div>
              <div className="text-xs text-muted-foreground">{format(d, "MMM d, yyyy")}</div>
              <div className="text-xs text-muted-foreground">· {dayEvents.length} {dayEvents.length === 1 ? "meeting" : "meetings"}</div>
            </div>
            <div className="grid gap-2">
              {dayEvents.map((e) => <EventRow key={e.id} e={e} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventRow({ e }: { e: import("@/lib/google-calendar.server").CalendarEvent }) {
  const start = new Date(e.start);
  const end = new Date(e.end);
  const timeLabel = e.all_day ? "All day" : `${format(start, "HH:mm")} – ${format(end, "HH:mm")}`;
  return (
    <Card className="hover:border-primary/40 transition">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{timeLabel}</span>
              {e.status && e.status !== "confirmed" && <Badge variant="outline" className="text-[10px] capitalize">{e.status}</Badge>}
            </div>
            <div className="mt-1 font-medium truncate">{e.summary}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {e.attendees_count > 0 && (
                <span className="inline-flex items-center gap-1"><Users2 className="h-3 w-3" />{e.attendees_count} attendee{e.attendees_count === 1 ? "" : "s"}</span>
              )}
              {e.location && (
                <span className="inline-flex items-center gap-1 truncate max-w-[220px]"><MapPin className="h-3 w-3" />{e.location}</span>
              )}
              {e.organizer && (
                <span className="truncate">organized by {e.organizer}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end shrink-0">
            {e.meeting_link && (
              <Button asChild size="sm" variant="outline">
                <a href={e.meeting_link} target="_blank" rel="noreferrer"><Video className="h-3.5 w-3.5" />Join</a>
              </Button>
            )}
            {e.html_link && (
              <a href={e.html_link} target="_blank" rel="noreferrer" className="text-[11px] text-muted-foreground inline-flex items-center gap-1 hover:text-primary">
                Open in Calendar <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
