import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarRange, Plus, Check, X, Pencil, Trash2 } from "lucide-react";
import { format, differenceInCalendarDays, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend } from "date-fns";
import { logLeaveForEmployee, updateLeaveForEmployee, deleteLeaveForEmployee } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/hr/leave")({
  beforeLoad: () => { throw redirect({ to: "/hr-admin", search: { tab: "leaves" } }); },
});

const TYPES = [
  { v: "casual", l: "Casual", color: "bg-blue-500" },
  { v: "sick", l: "Sick", color: "bg-rose-500" },
  { v: "earned", l: "Earned", color: "bg-emerald-500" },
  { v: "unpaid", l: "Unpaid", color: "bg-amber-500" },
] as const;
type LType = (typeof TYPES)[number]["v"];
type LStatus = "pending" | "approved" | "rejected" | "cancelled";

type LeaveRow = {
  id: string;
  user_id: string;
  leave_type: LType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: LStatus;
  admin_comment: string | null;
  created_at: string;
};

type Employee = { id: string; full_name: string | null; email: string | null; department: string | null };

export function HrLeavePage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();

  if (me && !me.isSuperAdmin && !me.isHrAdmin) throw redirect({ to: "/dashboard" });

  const { data: employees } = useQuery({
    queryKey: ["hr-leave-employees"],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, department")
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      return (data ?? []) as Employee[];
    },
  });
  const empMap = useMemo(() => new Map((employees ?? []).map((e) => [e.id, e])), [employees]);

  const [monthAnchor, setMonthAnchor] = useState(() => format(new Date(), "yyyy-MM"));
  const monthStart = useMemo(() => startOfMonth(new Date(monthAnchor + "-01")), [monthAnchor]);
  const monthEnd = useMemo(() => endOfMonth(monthStart), [monthStart]);

  const { data: monthLeaves } = useQuery({
    queryKey: ["hr-leave-month", monthAnchor],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .lte("start_date", format(monthEnd, "yyyy-MM-dd"))
        .gte("end_date", format(monthStart, "yyyy-MM-dd"))
        .order("start_date", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as LeaveRow[];
    },
  });

  const { data: allRequests } = useQuery({
    queryKey: ["hr-leave-requests-all"],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as LeaveRow[];
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <CalendarRange className="h-6 w-6 text-primary" /> HR — Leave Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            See who's off, log leaves on behalf of anyone (including past dates), and approve or reject requests.
          </p>
        </div>
        <LogLeaveDialog employees={employees ?? []} onSaved={() => qc.invalidateQueries()} />
      </header>

      <Tabs defaultValue="day">
        <TabsList>
          <TabsTrigger value="day">Day view</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
        </TabsList>

        <TabsContent value="day" className="mt-4">
          <DayView empMap={empMap} onChanged={() => qc.invalidateQueries()} />
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <TimelineView
            monthAnchor={monthAnchor}
            onMonthChange={setMonthAnchor}
            monthStart={monthStart}
            monthEnd={monthEnd}
            leaves={monthLeaves ?? []}
            empMap={empMap}
          />
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <RequestsTable rows={allRequests ?? []} empMap={empMap} onChanged={() => qc.invalidateQueries()} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function typeColor(t: LType) {
  return TYPES.find((x) => x.v === t)?.color ?? "bg-muted";
}

function DayView({ empMap, onChanged }: { empMap: Map<string, Employee>; onChanged: () => void }) {
  const { data: me } = useCurrentUser();
  const [day, setDay] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading } = useQuery({
    queryKey: ["hr-leave-day", day, me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .in("status", ["approved", "pending"])
        .lte("start_date", day)
        .gte("end_date", day);
      if (error) throw new Error(error.message);
      return (data ?? []) as LeaveRow[];
    },
  });


  // Dedupe by user_id — prefer approved over pending
  const dedupedByUser = new Map<string, LeaveRow>();
  for (const r of data ?? []) {
    const existing = dedupedByUser.get(r.user_id);
    if (!existing || (existing.status !== "approved" && r.status === "approved")) {
      dedupedByUser.set(r.user_id, r);
    }
  }
  const rows = Array.from(dedupedByUser.values());
  const approved = rows.filter((r) => r.status === "approved");
  const pending = rows.filter((r) => r.status === "pending");
  const byType = new Map<LType, LeaveRow[]>();
  for (const r of rows) {
    if (!byType.has(r.leave_type)) byType.set(r.leave_type, []);
    byType.get(r.leave_type)!.push(r);
  }
  for (const list of byType.values()) {
    list.sort((a, b) => {
      const an = empMap.get(a.user_id)?.full_name ?? empMap.get(a.user_id)?.email ?? "";
      const bn = empMap.get(b.user_id)?.full_name ?? empMap.get(b.user_id)?.email ?? "";
      return an.localeCompare(bn);
    });
  }


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="font-display">On leave on {format(new Date(day), "EEEE, d MMM yyyy")}</CardTitle>
          <CardDescription>
            {rows.length} total · {approved.length} approved · {pending.length} pending
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Date</Label>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-44" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && <p className="text-sm text-muted-foreground">Nobody's on leave that day.</p>}
        {TYPES.map((t) => {
          const list = byType.get(t.v) ?? [];
          if (list.length === 0) return null;
          return (
            <div key={t.v}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${t.color}`} />
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{t.l} · {list.length}</div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {list.map((r) => {
                  const p = empMap.get(r.user_id);
                  return (
                    <div key={r.id} className="rounded-lg border border-border/60 p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{p?.full_name ?? p?.email ?? r.user_id.slice(0, 8)}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p?.department ?? "—"} · {format(new Date(r.start_date), "d MMM")} – {format(new Date(r.end_date), "d MMM")} · {r.days}d
                        </div>
                        {r.reason && <div className="text-xs mt-1 text-muted-foreground line-clamp-2">{r.reason}</div>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="capitalize">{r.status}</Badge>
                        <EditLeaveDialog row={r} employee={p} onChanged={onChanged} />
                        <DeleteLeaveButton row={r} onChanged={onChanged} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TimelineView({
  monthAnchor, onMonthChange, monthStart, monthEnd, leaves, empMap,
}: {
  monthAnchor: string;
  onMonthChange: (v: string) => void;
  monthStart: Date;
  monthEnd: Date;
  leaves: LeaveRow[];
  empMap: Map<string, Employee>;
}) {
  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);

  // Group by user_id
  const byUser = useMemo(() => {
    const m = new Map<string, LeaveRow[]>();
    for (const l of leaves) {
      if (!m.has(l.user_id)) m.set(l.user_id, []);
      m.get(l.user_id)!.push(l);
    }
    return m;
  }, [leaves]);

  const users = useMemo(
    () => Array.from(byUser.keys()).sort((a, b) =>
      (empMap.get(a)?.full_name ?? "").localeCompare(empMap.get(b)?.full_name ?? "")),
    [byUser, empMap],
  );

  const nameColW = 200;
  const cellW = 28;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="font-display">Timeline — {format(monthStart, "MMMM yyyy")}</CardTitle>
          <CardDescription>{users.length} people with leave this month</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Month</Label>
          <Input type="month" value={monthAnchor} onChange={(e) => onMonthChange(e.target.value)} className="w-44" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground flex-wrap">
          {TYPES.map((t) => (
            <div key={t.v} className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-4 rounded-sm ${t.color}`} /> {t.l}
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-transparent border-2 border-dashed border-muted-foreground" /> Pending
          </div>
        </div>

        {users.length === 0 && <p className="text-sm text-muted-foreground">No leaves this month.</p>}

        {users.length > 0 && (
          <div className="overflow-x-auto">
            <div style={{ minWidth: nameColW + days.length * cellW }}>
              {/* Header row */}
              <div className="flex sticky top-0 bg-background z-10">
                <div style={{ width: nameColW }} className="text-xs uppercase tracking-wider text-muted-foreground pb-2">Employee</div>
                {days.map((d) => (
                  <div key={d.toISOString()} style={{ width: cellW }}
                    className={`text-[10px] text-center pb-1 ${isWeekend(d) ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
                    <div>{format(d, "EEEEE")}</div>
                    <div className="font-medium">{format(d, "d")}</div>
                  </div>
                ))}
              </div>

              {users.map((uid) => {
                const p = empMap.get(uid);
                const rows = byUser.get(uid) ?? [];
                return (
                  <div key={uid} className="flex items-center border-t border-border/40 relative" style={{ height: 36 }}>
                    <div style={{ width: nameColW }} className="text-sm truncate pr-2">
                      <div className="font-medium truncate">{p?.full_name ?? p?.email ?? uid.slice(0, 8)}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{p?.department ?? "—"}</div>
                    </div>
                    <div className="relative flex" style={{ width: days.length * cellW, height: 36 }}>
                      {days.map((d) => (
                        <div key={d.toISOString()} style={{ width: cellW }}
                          className={`h-full ${isWeekend(d) ? "bg-muted/30" : ""} border-r border-border/20`} />
                      ))}
                      {rows.map((r) => {
                        const s = new Date(r.start_date);
                        const e = new Date(r.end_date);
                        const clampedStart = s < monthStart ? monthStart : s;
                        const clampedEnd = e > monthEnd ? monthEnd : e;
                        const startIdx = Math.max(0, differenceInCalendarDays(clampedStart, monthStart));
                        const spanDays = differenceInCalendarDays(clampedEnd, clampedStart) + 1;
                        const dashed = r.status !== "approved";
                        const dim = r.status === "rejected" || r.status === "cancelled";
                        return (
                          <div key={r.id}
                            title={`${p?.full_name ?? ""} · ${r.leave_type} · ${format(s, "d MMM")}–${format(e, "d MMM")} · ${r.status}${r.reason ? "\n" + r.reason : ""}`}
                            className={`absolute top-1 bottom-1 rounded-sm ${typeColor(r.leave_type)} ${dashed ? "border-2 border-dashed border-background" : ""} ${dim ? "opacity-40" : ""}`}
                            style={{ left: startIdx * cellW + 2, width: spanDays * cellW - 4 }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RequestsTable({ rows, empMap, onChanged }: { rows: LeaveRow[]; empMap: Map<string, Employee>; onChanged: () => void }) {
  const [status, setStatus] = useState<"all" | LStatus>("pending");
  const [type, setType] = useState<"all" | LType>("all");
  const [q, setQ] = useState("");
  const [comment, setComment] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (type !== "all" && r.leave_type !== type) return false;
      if (qq) {
        const p = empMap.get(r.user_id);
        const hay = `${p?.full_name ?? ""} ${p?.email ?? ""} ${p?.department ?? ""}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      return true;
    });
  }, [rows, status, type, q, empMap]);

  async function decide(r: LeaveRow, newStatus: "approved" | "rejected") {
    setBusy(r.id);
    const { error } = await supabase.from("leave_requests")
      .update({ status: newStatus, admin_comment: comment[r.id] ?? r.admin_comment, decided_at: new Date().toISOString() })
      .eq("id", r.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${newStatus}`);
    onChanged();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="font-display">All requests</CardTitle>
          <CardDescription>{filtered.length} of {rows.length}</CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input placeholder="Search name, email, dept" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-56" />
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No matching requests.</p>}
        {filtered.map((r) => {
          const p = empMap.get(r.user_id);
          return (
            <div key={r.id} className="rounded-lg border border-border/60 p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{p?.full_name ?? p?.email ?? r.user_id.slice(0, 8)}
                    <span className="text-muted-foreground font-normal"> · {p?.department ?? "—"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {r.leave_type} · {format(new Date(r.start_date), "d MMM")} – {format(new Date(r.end_date), "d MMM yyyy")} · {r.days}d
                  </div>
                  {r.reason && <div className="text-xs mt-1">{r.reason}</div>}
                  {r.admin_comment && <div className="text-xs mt-1"><span className="text-muted-foreground">Admin:</span> {r.admin_comment}</div>}
                </div>
                <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="capitalize shrink-0">{r.status}</Badge>
              </div>
              {(r.status === "pending") && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <Input placeholder="Optional comment" value={comment[r.id] ?? ""} onChange={(e) => setComment((c) => ({ ...c, [r.id]: e.target.value }))} className="h-8 flex-1 min-w-48" />
                  <Button size="sm" onClick={() => decide(r, "approved")} disabled={busy === r.id} className="gap-1"><Check className="h-3.5 w-3.5" /> Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => decide(r, "rejected")} disabled={busy === r.id} className="gap-1"><X className="h-3.5 w-3.5" /> Reject</Button>
                </div>
              )}
              {r.status !== "pending" && (
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => decide(r, r.status === "approved" ? "rejected" : "approved")} disabled={busy === r.id}>
                    Change to {r.status === "approved" ? "rejected" : "approved"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function LogLeaveDialog({ employees, onSaved }: { employees: Employee[]; onSaved: () => void }) {
  const logLeaveFn = useServerFn(logLeaveForEmployee);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [type, setType] = useState<LType>("casual");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setUserId(""); setType("casual"); setStart(""); setEnd(""); setReason("");
  }

  async function submit() {
    if (!userId) return toast.error("Pick an employee");
    if (!start || !end) return toast.error("Pick dates");
    const days = differenceInCalendarDays(new Date(end), new Date(start)) + 1;
    if (days <= 0) return toast.error("End must be after start");
    setBusy(true);
    const payload = {
      user_id: userId,
      leave_type: type,
      start_date: start,
      end_date: end,
      days,
      reason: reason.trim() || "Logged by HR",
    };
    try {
      await logLeaveFn({ data: payload });
      toast.success("Leave logged and approved — balance updated");
      reset(); setOpen(false); onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }


  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button className="gradient-primary gap-2"><Plus className="h-4 w-4" /> Log leave</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Log leave for an employee</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Employee</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {employees.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name ?? p.email}{p.department ? ` · ${p.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as LType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Start</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1"><Label>End</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Reason / note</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional context" /></div>
          <p className="text-xs text-muted-foreground">Leave is auto-approved and deducted from the employee's balance. Past dates are allowed.</p>

        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="gradient-primary">{busy ? "Saving…" : "Log leave"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
