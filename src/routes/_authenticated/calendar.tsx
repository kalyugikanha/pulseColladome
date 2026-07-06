import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useHolidays, weeklyOffLabel } from "@/hooks/use-holidays";
import { createTeamCalendarBooking, findAvailableSlots, listTeamCalendarEvents, syncMyGoogleCalendar } from "@/lib/google-calendar.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  addMonths, endOfMonth, format, isWithinInterval, startOfMonth,
  startOfWeek, endOfWeek, addDays, isSameDay, isToday,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, PartyPopper, Search, Cake, Trophy,
  CalendarClock, Filter, Settings2, X, RefreshCw, Plus, Link as LinkIcon, AlertCircle,
  CalendarIcon, Users, ArrowLeft, ArrowRight, Check,
} from "lucide-react";


export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

// -------- helpers --------
const TYPE_COLOR: Record<string, string> = {
  casual: "bg-primary/20 text-primary border-primary/40",
  sick: "bg-destructive/20 text-destructive border-destructive/40",
  earned: "bg-success/20 text-success border-success/40",
  unpaid: "bg-muted text-muted-foreground border-border",
};

const DEPT_PALETTE = [
  "#6366f1", "#ec4899", "#14b8a6", "#f59e0b",
  "#8b5cf6", "#22c55e", "#ef4444", "#0ea5e9",
  "#a855f7", "#eab308", "#10b981", "#f97316",
];

function hashDept(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % DEPT_PALETTE.length;
}

function defaultDeptColor(name: string | null | undefined): string {
  if (!name) return "#64748b";
  return DEPT_PALETTE[hashDept(name.toLowerCase())];
}

function mmdd(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "MM-dd");
}

function yearsBetween(from: string, on: Date): number {
  const f = new Date(from);
  let years = on.getFullYear() - f.getFullYear();
  const preAnniv = on.getMonth() < f.getMonth() ||
    (on.getMonth() === f.getMonth() && on.getDate() < f.getDate());
  if (preAnniv) years -= 1;
  return years;
}

type Filters = {
  q: string;
  depts: Set<string>;
  employees: Set<string>;
  showLeave: boolean;
  showMeetings: boolean;
  showBirthdays: boolean;
  showAnniversaries: boolean;
  showHolidays: boolean;
};

// -------- page --------
function CalendarPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const fetchTeamCalendar = useServerFn(listTeamCalendarEvents);
  const syncGoogleCalendar = useServerFn(syncMyGoogleCalendar);
  const [cursor, setCursor] = useState(new Date());
  const [openDay, setOpenDay] = useState<Date | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    q: "",
    depts: new Set(),
    employees: new Set(),
    showLeave: true,
    showMeetings: true,
    showBirthdays: true,
    showAnniversaries: true,
    showHolidays: true,
  });


  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const { data: profiles } = useQuery({
    queryKey: ["calendar-profiles"],
    queryFn: async () =>
      (await supabase.from("profiles")
        .select("id, full_name, email, department, date_of_birth, joined_on, avatar_url")
        .order("full_name", { ascending: true })).data ?? [],
  });

  const { data: leaves } = useQuery({
    queryKey: ["team-leave", format(monthStart, "yyyy-MM")],
    queryFn: async () => (await supabase.from("leave_requests")
      .select("id,user_id,leave_type,start_date,end_date,status,reason,user:profiles!leave_requests_user_profile_fkey(full_name)")
      .in("status", me?.isAdmin ? ["approved", "pending"] : ["approved"])
      .lte("start_date", format(gridEnd, "yyyy-MM-dd"))
      .gte("end_date", format(gridStart, "yyyy-MM-dd"))
    ).data ?? [],
  });

  const { data: deptSettings } = useQuery({
    queryKey: ["department-settings"],
    queryFn: async () => (await supabase.from("department_settings").select("name, color")).data ?? [],
  });

  const { data: holidays } = useHolidays();

  const { data: teamCalendar, isFetching: calendarFetching } = useQuery({
    queryKey: ["team-google-calendar", format(gridStart, "yyyy-MM-dd"), format(gridEnd, "yyyy-MM-dd")],
    queryFn: () => fetchTeamCalendar({
      data: { startISO: gridStart.toISOString(), endISO: addDays(gridEnd, 1).toISOString() },
    }),
    staleTime: 60_000,
  });

  const myCalendarStatus = (teamCalendar?.statuses ?? []).find((s: any) => s.user_id === me?.id);
  const connectedCount = teamCalendar?.statuses?.length ?? 0;
  const visibleProfiles = teamCalendar?.profiles ?? profiles ?? [];

  async function syncCalendar() {
    const result = await syncGoogleCalendar({ data: { startISO: gridStart.toISOString(), endISO: addDays(gridEnd, 1).toISOString() } });
    if (!result.connected) return toast.error(result.error ?? "Connect Google Calendar first.");
    if (result.error) return toast.error(result.error);
    toast.success(`Synced ${result.synced} calendar block${result.synced === 1 ? "" : "s"}`);
    await qc.invalidateQueries({ queryKey: ["team-google-calendar"] });
    await qc.invalidateQueries({ queryKey: ["my-google-status"] });
  }

  const deptColorMap = useMemo(() => {
    const m = new Map<string, string>();
    (deptSettings ?? []).forEach((d) => m.set(d.name, d.color));
    return m;
  }, [deptSettings]);

  const colorForDept = (name: string | null | undefined) =>
    (name && deptColorMap.get(name)) || defaultDeptColor(name);

  const profileById = useMemo(() => {
    const m = new Map<string, (typeof visibleProfiles)[number]>();
    visibleProfiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [visibleProfiles]);

  const allDepts = useMemo(() => {
    const s = new Set<string>();
    visibleProfiles.forEach((p) => p.department && s.add(p.department));
    return Array.from(s).sort();
  }, [visibleProfiles]);

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const holidayByDate = new Map((holidays ?? []).map((h) => [h.holiday_date, h.name]));

  const matchesFilters = (userId: string | null | undefined) => {
    if (!userId) return true;
    const p = profileById.get(userId);
    if (!p) return true;
    if (filters.employees.size && !filters.employees.has(userId)) return false;
    if (filters.depts.size && (!p.department || !filters.depts.has(p.department))) return false;
    if (filters.q.trim()) {
      const q = filters.q.trim().toLowerCase();
      const hay = `${p.full_name ?? ""} ${p.email ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };


  const eventsForDay = (d: Date) => {
    const list: { title: string; owner?: string | null; dept?: string | null; kind: "internal" | "client" | "booking" | "private"; time?: string; userId?: string; details?: string | null }[] = [];
    for (const ev of teamCalendar?.events ?? []) {
      const start = new Date(ev.start_at);
      const end = new Date(ev.end_at);
      const sameDay = isSameDay(d, start) ||
        (start < d && end > d) ||
        isSameDay(d, end);
      if (!sameDay) continue;
      if (!matchesFilters(ev.user_id)) continue;
      const p = profileById.get(ev.user_id);
      const summary = ev.summary || "Busy";
      const isPrivate = !!ev.is_private;
      const isClient = !isPrivate && /client|external|customer/i.test(summary + " " + (ev.description_snippet ?? ""));
      list.push({
        title: isPrivate ? "Busy" : summary,
        owner: p?.full_name ?? p?.email ?? "Team member",
        dept: p?.department ?? null,
        kind: isPrivate ? "private" : isClient ? "client" : "internal",
        time: ev.all_day ? undefined : format(start, "HH:mm"),
        userId: ev.user_id,
        details: isPrivate ? null : ev.description_snippet,
      });
    }
    for (const booking of teamCalendar?.bookings ?? []) {
      const start = new Date(booking.start_at);
      const end = new Date(booking.end_at);
      const sameDay = isSameDay(d, start) || (start < d && end > d) || isSameDay(d, end);
      if (!sameDay) continue;
      const creator = profileById.get(booking.created_by);
      list.push({
        title: booking.title,
        owner: creator?.full_name ?? creator?.email ?? "Team booking",
        dept: creator?.department ?? null,
        kind: "booking",
        time: format(start, "HH:mm"),
        userId: booking.created_by,
        details: booking.description,
      });
    }
    return list;
  };

  const birthdaysForDay = (d: Date) => {
    if (!filters.showBirthdays) return [];
    const key = mmdd(d);
    return visibleProfiles.filter((p) =>
      p.date_of_birth && mmdd(p.date_of_birth) === key && matchesFilters(p.id));
  };

  const anniversariesForDay = (d: Date) => {
    if (!filters.showAnniversaries) return [];
    const key = mmdd(d);
    return visibleProfiles
      .filter((p) => p.joined_on && mmdd(p.joined_on) === key && matchesFilters(p.id))
      .map((p) => ({ ...p, years: yearsBetween(p.joined_on!, d) }))
      .filter((p) => p.years > 0);
  };

  const dayLeaves = (d: Date) =>
    !filters.showLeave ? [] :
    (leaves ?? []).filter((l: any) =>
      isWithinInterval(d, { start: new Date(l.start_date), end: new Date(l.end_date) }) &&
      matchesFilters(l.user_id));

  const toggleDept = (name: string) => {
    setFilters((f) => {
      const next = new Set(f.depts);
      if (next.has(name)) next.delete(name); else next.add(name);
      return { ...f, depts: next };
    });
  };

  const activeFilters =
    (filters.q ? 1 : 0) +
    filters.depts.size +
    [filters.showLeave, filters.showMeetings, filters.showBirthdays, filters.showAnniversaries, filters.showHolidays]
      .filter((v) => !v).length;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">Team Calendar</h1>
          <p className="text-muted-foreground text-sm mt-1">Leave, meetings, birthdays & anniversaries at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <BookingDialog profiles={visibleProfiles} onSaved={() => qc.invalidateQueries({ queryKey: ["team-google-calendar"] })} />
          <MyDatesDialog />
          {me?.isAdmin && <DeptColorsDialog depts={allDepts} colorFor={colorForDept} onSaved={() => qc.invalidateQueries({ queryKey: ["department-settings"] })} />}
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="font-display font-semibold min-w-[140px] text-center">{format(cursor, "MMMM yyyy")}</div>
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </header>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="font-medium">Team Google Calendar sync</div>
              <div className="text-xs text-muted-foreground">
                {myCalendarStatus
                  ? `Connected${myCalendarStatus.last_synced_at ? ` · last sync ${format(new Date(myCalendarStatus.last_synced_at), "MMM d, HH:mm")}` : " · not synced yet"}`
                  : "Connect your calendar so the team can see your blocked time."} {connectedCount} connected.
              </div>
              {myCalendarStatus?.sync_error && <div className="mt-1 text-xs text-destructive">{myCalendarStatus.sync_error}</div>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!myCalendarStatus && (
              <Button asChild size="sm" variant="outline">
                <a href="/google-calendar-connect"><LinkIcon className="h-4 w-4" />Connect</a>
              </Button>
            )}
            <Button size="sm" onClick={syncCalendar} disabled={!myCalendarStatus || calendarFetching}>
              <RefreshCw className={`h-4 w-4 ${calendarFetching ? "animate-spin" : ""}`} /> Sync now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3 md:p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee..."
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                className="pl-8"
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" /> Filters
                  {activeFilters > 0 && <Badge variant="secondary" className="h-5 px-1.5">{activeFilters}</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-3" align="end">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Show</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {([
                      ["showLeave", "Leave"],
                      ["showMeetings", "Meetings"],
                      ["showBirthdays", "Birthdays"],
                      ["showAnniversaries", "Anniversaries"],
                      ["showHolidays", "Holidays"],
                    ] as const).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters[k]}
                          onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.checked }))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                {allDepts.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Departments</div>
                    <div className="flex flex-wrap gap-1.5">
                      {allDepts.map((d) => {
                        const active = filters.depts.has(d);
                        return (
                          <button
                            key={d}
                            onClick={() => toggleDept(d)}
                            className={`text-xs rounded-md border px-2 py-0.5 transition-colors ${active ? "border-primary bg-primary/20 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"}`}
                            style={{ borderLeft: `3px solid ${colorForDept(d)}` }}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {activeFilters > 0 && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setFilters({ q: "", depts: new Set(), showLeave: true, showMeetings: true, showBirthdays: true, showAnniversaries: true, showHolidays: true })}>
                    <X className="h-3 w-3 mr-1" /> Clear filters
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(TYPE_COLOR).map(([k, cls]) => (
              <span key={k} className={`inline-flex items-center rounded-md border px-2 py-0.5 capitalize ${cls}`}>{k}</span>
            ))}
            <span className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 text-warning px-2 py-0.5"><PartyPopper className="h-3 w-3" />Holiday</span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 text-muted-foreground px-2 py-0.5">Weekly off</span>
            <span className="inline-flex items-center gap-1 rounded-md border border-pink-500/40 bg-pink-500/10 text-pink-500 px-2 py-0.5"><Cake className="h-3 w-3" />Birthday</span>
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-500 px-2 py-0.5"><Trophy className="h-3 w-3" />Anniversary</span>
            <span className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 text-cyan-500 px-2 py-0.5"><CalendarClock className="h-3 w-3" />Meeting</span>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      <Card>
        <CardContent className="p-2 md:p-4">
          <div className="grid grid-cols-7 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => <div key={d} className="px-2 py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const iso = format(d, "yyyy-MM-dd");
              const holiday = filters.showHolidays ? holidayByDate.get(iso) : undefined;
              const offLabel = weeklyOffLabel(d);
              const dl = dayLeaves(d);
              const bdays = birthdaysForDay(d);
              const annivs = anniversariesForDay(d);
              const evs = filters.showMeetings ? eventsForDay(d) : [];
              const isCurrent = isToday(d);
              const bg = holiday
                ? "border-warning/50 bg-warning/10"
                : offLabel
                ? "border-border bg-muted/40"
                : "border-border/50";
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setOpenDay(d)}
                  className={`text-left min-h-[110px] rounded-md border p-2 transition-colors hover:border-primary/60 hover:bg-surface/60 ${bg} ${inMonth ? (holiday || offLabel) ? "" : "bg-surface/40" : "bg-transparent opacity-50"} ${isCurrent ? "ring-2 ring-primary/60" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${isCurrent ? "text-primary" : ""}`}>{format(d, "d")}</span>
                    <div className="flex items-center gap-1">
                      {bdays.length > 0 && <Cake className="h-3 w-3 text-pink-500" />}
                      {annivs.length > 0 && <Trophy className="h-3 w-3 text-amber-500" />}
                      {dl.length > 0 && <Badge variant="outline" className="h-4 px-1 text-[10px]">{dl.length}</Badge>}
                    </div>
                  </div>
                  {holiday && (
                    <div className="mb-1 truncate rounded px-1.5 py-0.5 text-[10px] font-semibold border border-warning/40 bg-warning/20 text-warning" title={holiday}>
                      🎉 {holiday}
                    </div>
                  )}
                  {!holiday && offLabel && (
                    <div className="mb-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium border border-border bg-background/40 text-muted-foreground">
                      {offLabel}
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {bdays.slice(0, 2).map((p) => (
                      <div key={"b" + p.id} className="truncate rounded px-1.5 py-0.5 text-[10px] border border-pink-500/40 bg-pink-500/10 text-pink-500"
                        style={{ borderLeft: `3px solid ${colorForDept(p.department)}` }}
                        title={`Birthday: ${p.full_name}`}>
                        🎂 {p.full_name?.split(" ")[0]}
                      </div>
                    ))}
                    {annivs.slice(0, 2).map((p) => (
                      <div key={"a" + p.id} className="truncate rounded px-1.5 py-0.5 text-[10px] border border-amber-500/40 bg-amber-500/10 text-amber-500"
                        style={{ borderLeft: `3px solid ${colorForDept(p.department)}` }}
                        title={`${p.years} yr anniversary: ${p.full_name}`}>
                        🎊 {p.full_name?.split(" ")[0]} · {p.years}y
                      </div>
                    ))}
                    {dl.slice(0, 3).map((l: any) => {
                      const dept = profileById.get(l.user_id)?.department;
                      return (
                        <div
                          key={l.id}
                          className={`truncate rounded px-1.5 py-0.5 text-[10px] border ${TYPE_COLOR[l.leave_type]} ${l.status === "pending" ? "opacity-60 border-dashed" : ""}`}
                          style={{ borderLeft: `3px solid ${colorForDept(dept)}` }}
                          title={`${l.user?.full_name ?? "Someone"} · ${l.leave_type}`}
                        >
                          {l.user?.full_name?.split(" ")[0] ?? "—"}
                        </div>
                      );
                    })}
                    {evs.slice(0, 3).map((ev, i) => (
                      <div key={"e" + i}
                        className={`truncate rounded px-1.5 py-0.5 text-[10px] border ${ev.kind === "booking" ? "border-success/40 bg-success/10 text-success" : ev.kind === "client" ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-500" : ev.kind === "private" ? "border-border bg-muted/60 text-muted-foreground" : "border-indigo-400/40 bg-indigo-400/10 text-indigo-400"}`}
                        style={{ borderLeft: ev.dept ? `3px solid ${colorForDept(ev.dept)}` : undefined }}
                        title={`${ev.owner ?? ""} · ${ev.title}`}>
                        📅 {ev.time ? `${ev.time} · ` : ""}{ev.owner ? `${ev.owner.split(" ")[0]}: ` : ""}{ev.title}
                      </div>
                    ))}
                    {(dl.length + evs.length + bdays.length + annivs.length) > 6 && (
                      <div className="text-[10px] text-muted-foreground px-1">+ more</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <DayDetailSheet
        day={openDay}
        onOpenChange={(v) => !v && setOpenDay(null)}
        profiles={visibleProfiles}
        leaves={(leaves ?? []).filter((l: any) => openDay && isWithinInterval(openDay, { start: new Date(l.start_date), end: new Date(l.end_date) }))}
        events={openDay ? eventsForDay(openDay) : []}
        birthdays={openDay ? birthdaysForDay(openDay) : []}
        anniversaries={openDay ? anniversariesForDay(openDay) : []}
        holiday={openDay ? holidayByDate.get(format(openDay, "yyyy-MM-dd")) : undefined}
        offLabel={openDay ? (weeklyOffLabel(openDay) ?? "") : ""}
        colorForDept={colorForDept}
      />
    </div>
  );
}

// -------- DayDetailSheet --------
function DayDetailSheet({
  day, onOpenChange, profiles, leaves, events, birthdays, anniversaries, holiday, offLabel, colorForDept,
}: {
  day: Date | null;
  onOpenChange: (open: boolean) => void;
  profiles: Array<{ id: string; full_name: string | null; email: string | null; department: string | null }>;
  leaves: any[];
  events: { title: string; owner?: string | null; dept?: string | null; kind: "internal" | "client" | "booking" | "private"; time?: string; details?: string | null }[];
  birthdays: Array<{ id: string; full_name: string | null; department: string | null }>;
  anniversaries: Array<{ id: string; full_name: string | null; department: string | null; years: number }>;
  holiday?: string;
  offLabel: string;
  colorForDept: (name: string | null | undefined) => string;
}) {
  const busyIds = new Set(leaves.map((l: any) => l.user_id));
  const available = profiles.filter((p) => !busyIds.has(p.id));
  const groupedAvailable = useMemo(() => {
    const m = new Map<string, typeof available>();
    available.forEach((p) => {
      const key = p.department || "Unassigned";
      const arr = m.get(key) ?? [];
      arr.push(p);
      m.set(key, arr);
    });
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [available]);

  const isOffDay = !!(holiday || offLabel);

  return (
    <Sheet open={!!day} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{day ? format(day, "EEEE, MMM d, yyyy") : ""}</SheetTitle>
          <SheetDescription>
            {holiday ? `🎉 ${holiday}` : offLabel ? offLabel : "Team overview"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {birthdays.length > 0 && (
            <Section title="Birthdays" icon={<Cake className="h-4 w-4 text-pink-500" />}>
              {birthdays.map((p) => (
                <PersonRow key={p.id} name={p.full_name} dept={p.department} colorForDept={colorForDept} suffix="🎂" />
              ))}
            </Section>
          )}

          {anniversaries.length > 0 && (
            <Section title="Work anniversaries" icon={<Trophy className="h-4 w-4 text-amber-500" />}>
              {anniversaries.map((p) => (
                <PersonRow key={p.id} name={p.full_name} dept={p.department} colorForDept={colorForDept} suffix={`${p.years} yr${p.years > 1 ? "s" : ""}`} />
              ))}
            </Section>
          )}

          {leaves.length > 0 && (
            <Section title={`On leave (${leaves.length})`} icon={<CalendarClock className="h-4 w-4 text-primary" />}>
              {leaves.map((l: any) => (
                <PersonRow
                  key={l.id}
                  name={l.user?.full_name ?? "Someone"}
                  dept={profiles.find((p) => p.id === l.user_id)?.department ?? null}
                  colorForDept={colorForDept}
                  suffix={<Badge variant="outline" className={`capitalize ${TYPE_COLOR[l.leave_type]}`}>{l.leave_type}{l.status === "pending" ? " · pending" : ""}</Badge>}
                />
              ))}
            </Section>
          )}

          {events.length > 0 && (
            <Section title={`Calendar blocks (${events.length})`} icon={<CalendarClock className="h-4 w-4 text-cyan-500" />}>
              {events.map((ev, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-border/60 bg-surface/40 px-3 py-2 text-sm"
                  style={{ borderLeft: `3px solid ${ev.kind === "booking" ? "var(--success)" : colorForDept(ev.dept)}` }}>
                  <div className="truncate">
                    <div className="truncate font-medium">{ev.title}</div>
                    <div className="text-[11px] text-muted-foreground">{ev.time ?? "All day"} · {ev.owner ?? "Team"} · {ev.kind}</div>
                    {ev.details && <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{ev.details}</div>}
                  </div>
                </div>
              ))}
            </Section>
          )}

          {!isOffDay && (
            <Section title={`Available (${available.length})`} icon={<Filter className="h-4 w-4 text-success" />}>
              {groupedAvailable.map(([dept, list]) => (
                <div key={dept} className="space-y-1">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: colorForDept(dept === "Unassigned" ? null : dept) }} />
                    {dept}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((p) => (
                      <a
                        key={p.id}
                        href={p.email ? `mailto:${p.email}` : undefined}
                        className="text-[11px] rounded-md border border-border bg-surface/40 px-2 py-0.5 hover:border-primary/60 hover:text-primary"
                        title={p.email ?? ""}
                      >
                        {p.full_name}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
              {available.length === 0 && (
                <div className="text-sm text-muted-foreground">Everyone's out today.</div>
              )}
            </Section>
          )}

          {isOffDay && leaves.length === 0 && birthdays.length === 0 && anniversaries.length === 0 && events.length === 0 && (
            <div className="text-sm text-muted-foreground">{holiday ? "Company holiday — no scheduled activity." : "Weekly off — no scheduled activity."}</div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BookingDialog({ profiles, onSaved }: { profiles: Array<{ email: string | null; full_name: string | null }>; onSaved: () => void }) {
  const createBooking = useServerFn(createTeamCalendarBooking);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [attendees, setAttendees] = useState("");
  const [description, setDescription] = useState("");

  async function save() {
    setBusy(true);
    try {
      const result = await createBooking({ data: {
        title,
        startISO: new Date(start).toISOString(),
        endISO: new Date(end).toISOString(),
        attendeeEmails: attendees.split(/[\n,]/).map((v) => v.trim()).filter(Boolean),
        description,
      } });
      if (!result.ok) {
        toast.error(result.error ?? "Booking saved, but Google Calendar creation failed.");
      } else {
        toast.success("Team time booked");
      }
      setOpen(false);
      setTitle("");
      setStart("");
      setEnd("");
      setAttendees("");
      setDescription("");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not book team time");
    } finally {
      setBusy(false);
    }
  }

  const teamEmails = profiles.map((p) => p.email).filter(Boolean) as string[];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Book time</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Book team time</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Client review, sprint planning…" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Starts</Label><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Ends</Label><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Attendees</Label>
            <Textarea rows={3} value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="name@colladome.com, teammate@colladome.com" />
            {teamEmails.length > 0 && <div className="text-[11px] text-muted-foreground">Paste comma-separated work emails. {teamEmails.length} team emails are available in directory.</div>}
          </div>
          <div className="space-y-1.5"><Label>What is this time for?</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>If booking fails with permission error, reconnect Google Calendar once so it grants event booking permission.</span>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Booking…" : "Book"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function PersonRow({ name, dept, colorForDept, suffix }: {
  name: string | null;
  dept: string | null;
  colorForDept: (name: string | null | undefined) => string;
  suffix?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-surface/40 px-3 py-2 text-sm"
      style={{ borderLeft: `3px solid ${colorForDept(dept)}` }}>
      <div className="truncate">
        <div className="truncate font-medium">{name ?? "—"}</div>
        {dept && <div className="text-[11px] text-muted-foreground">{dept}</div>}
      </div>
      <div className="text-xs">{suffix}</div>
    </div>
  );
}

// -------- My dates dialog --------
function MyDatesDialog() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dob, setDob] = useState("");
  const [joined, setJoined] = useState("");
  const [busy, setBusy] = useState(false);

  const loadCurrent = async () => {
    if (!me?.id) return;
    const { data } = await supabase.from("profiles").select("date_of_birth, joined_on").eq("id", me.id).maybeSingle();
    setDob(data?.date_of_birth ?? "");
    setJoined(data?.joined_on ?? "");
  };

  async function save() {
    if (!me?.id) return;
    setBusy(true);
    const { error } = await supabase.from("profiles")
      .update({ date_of_birth: dob || null, joined_on: joined || null })
      .eq("id", me.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["calendar-profiles"] });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) loadCurrent(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2"><Cake className="h-4 w-4" /> My dates</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>My birthday & join date</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="dob">Date of birth</Label>
            <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="joined">Joined on</Label>
            <Input id="joined" type="date" value={joined} onChange={(e) => setJoined(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Shown on the team calendar as birthday & anniversary chips.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Department colors dialog (admin) --------
function DeptColorsDialog({ depts, colorFor, onSaved }: {
  depts: string[];
  colorFor: (d: string) => string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = () => {
    const v: Record<string, string> = {};
    depts.forEach((d) => (v[d] = colorFor(d)));
    setValues(v);
  };

  async function save() {
    setBusy(true);
    const rows = Object.entries(values).map(([name, color]) => ({ name, color }));
    const { error } = await supabase.from("department_settings").upsert(rows, { onConflict: "name" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Department colors saved");
    onSaved();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2"><Settings2 className="h-4 w-4" /> Dept colors</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Department colors</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {depts.length === 0 && <div className="text-sm text-muted-foreground">No departments configured yet.</div>}
          {depts.map((d) => (
            <div key={d} className="flex items-center gap-3">
              <input
                type="color"
                value={values[d] ?? "#64748b"}
                onChange={(e) => setValues((v) => ({ ...v, [d]: e.target.value }))}
                className="h-9 w-14 rounded border border-border bg-transparent cursor-pointer"
              />
              <div className="flex-1 text-sm">{d}</div>
              <span className="text-xs text-muted-foreground">{values[d]}</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || depts.length === 0}>{busy ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
