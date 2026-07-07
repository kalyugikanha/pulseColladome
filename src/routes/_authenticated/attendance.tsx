import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, X, CalendarIcon, Download, Users, Plane, LogIn, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVisibilityScope } from "@/hooks/use-visibility-scope";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

function AttendancePage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [overviewDate, setOverviewDate] = useState<Date>(new Date());
  const [overviewSearch, setOverviewSearch] = useState("");
  const overviewDateStr = format(overviewDate, "yyyy-MM-dd");

  const canView = !!me && (me.isAdmin || me.isReportingManager);
  const { userScope } = useVisibilityScope(me);
  const deptScope: string[] | null = null;

  const { data } = useQuery({
    queryKey: ["attendance", me?.id, today, deptScope?.join(",") ?? "all", userScope?.join(",") ?? "all"],
    enabled: canView,
    queryFn: async () => {
      let peopleQ = supabase.from("profiles").select("id, full_name, email, department");
      if (deptScope && deptScope.length) peopleQ = peopleQ.in("department", deptScope);
      if (userScope && userScope.length) peopleQ = peopleQ.in("id", userScope);
      const [people, todayAtt, todayLeaves] = await Promise.all([
        peopleQ,
        supabase.from("attendance_logs").select("user_id, punch_in_time, punch_out_time, total_hours").eq("date", today),
        supabase.from("leave_requests")
          .select("user_id, leave_type, start_date, end_date, reason")
          .eq("status", "approved")
          .lte("start_date", today)
          .gte("end_date", today),
      ]);
      const peopleList = people.data ?? [];
      const nameById = new Map(peopleList.map((p) => [p.id, p]));
      const scopedLeaves = ((todayLeaves.data ?? []) as Array<{
        user_id: string; leave_type: string; start_date: string; end_date: string; reason: string | null;
      }>).filter((l) => nameById.has(l.user_id));
      const pendingReq = me?.isAdmin
        ? await supabase.rpc("admin_get_leave_requests", { _status: "pending" })
        : await supabase.from("leave_requests").select("*").eq("status", "pending");
      const pendingWithUser = ((pendingReq.data ?? []) as Array<Record<string, unknown> & { user_id: string }>)
        .filter((r) => nameById.has(r.user_id) || me?.isAdmin)
        .map((r) => ({
          ...r,
          user: nameById.get(r.user_id)
            ? { full_name: nameById.get(r.user_id)!.full_name, email: nameById.get(r.user_id)!.email }
            : null,
        })) as unknown as Array<{
          id: string;
          leave_type: string;
          days: number;
          start_date: string;
          end_date: string;
          reason?: string | null;
          user: { full_name: string | null; email: string | null } | null;
        }>;
      return { people: peopleList, todayAtt: todayAtt.data ?? [], pending: pendingWithUser, onLeave: scopedLeaves };
    },
  });

  const { data: overview } = useQuery({
    queryKey: ["attendance-overview", overviewDateStr, deptScope?.join(",") ?? "all", userScope?.join(",") ?? "all"],
    enabled: canView,
    queryFn: async () => {
      let peopleQ = supabase.from("profiles").select("id, full_name, email, department, is_active").eq("is_active", true);
      if (deptScope && deptScope.length) peopleQ = peopleQ.in("department", deptScope);
      if (userScope && userScope.length) peopleQ = peopleQ.in("id", userScope);
      const [people, att, leaves] = await Promise.all([
        peopleQ,
        supabase.from("attendance_logs").select("user_id, punch_in_time, punch_out_time, total_hours").eq("date", overviewDateStr),
        supabase.from("leave_requests")
          .select("user_id, leave_type, start_date, end_date")
          .eq("status", "approved")
          .lte("start_date", overviewDateStr)
          .gte("end_date", overviewDateStr),
      ]);
      return { people: people.data ?? [], att: att.data ?? [], leaves: leaves.data ?? [] };
    },
  });

  if (me && !canView) {
    throw redirect({ to: "/dashboard" });
  }

  const sortedPeople = useMemo(() => {
    return (data?.people ?? []).slice().sort((a, b) => (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? ""));
  }, [data]);

  const overviewRows = useMemo(() => {
    const attById = new Map((overview?.att ?? []).map((a) => [a.user_id, a]));
    const leaveById = new Map((overview?.leaves ?? []).map((l) => [l.user_id, l]));
    const rows = (overview?.people ?? []).map((p) => {
      const a = attById.get(p.id);
      const leave = leaveById.get(p.id);
      const status: "leave" | "in" | "out" | "absent" = leave
        ? "leave"
        : a?.punch_in_time && !a.punch_out_time ? "in"
        : a?.punch_out_time ? "out" : "absent";
      return { p, a, leave, status };
    });
    const order = { leave: 0, absent: 1, in: 2, out: 3 } as const;
    rows.sort((x, y) => {
      const s = order[x.status] - order[y.status];
      if (s !== 0) return s;
      return (x.p.full_name ?? x.p.email ?? "").localeCompare(y.p.full_name ?? y.p.email ?? "");
    });
    const q = overviewSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.p.full_name ?? "").toLowerCase().includes(q) || (r.p.email ?? "").toLowerCase().includes(q));
  }, [overview, overviewSearch]);

  const counts = useMemo(() => {
    const total = overview?.people.length ?? 0;
    const onLeave = overviewRows.filter((r) => r.status === "leave").length;
    const punched = overviewRows.filter((r) => r.status === "in" || r.status === "out").length;
    const notPunched = Math.max(0, total - onLeave - punched);
    return { total, onLeave, punched, notPunched };
  }, [overview, overviewRows]);

  function exportOverviewCsv() {
    const header = ["Employee", "Email", "Department", "Status", "Punch in", "Punch out", "Hours"];
    const lines = [header.join(",")];
    for (const r of overviewRows) {
      const statusLabel = r.status === "leave"
        ? `On leave (${r.leave?.leave_type ?? ""})`
        : r.status === "in" ? "Punched in"
        : r.status === "out" ? "Punched out" : "Absent";
      const cells = [
        r.p.full_name ?? "",
        r.p.email ?? "",
        r.p.department ?? "",
        statusLabel,
        r.a?.punch_in_time ? format(new Date(r.a.punch_in_time), "HH:mm") : "",
        r.a?.punch_out_time ? format(new Date(r.a.punch_out_time), "HH:mm") : "",
        r.a?.total_hours ? Number(r.a.total_hours).toFixed(2) : "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${overviewDateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function decide(id: string, status: "approved" | "rejected", adminComment?: string) {
    const { error } = await supabase
      .from("leave_requests")
      .update({ status, admin_comment: adminComment || null, decided_by: me!.realId, decided_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Leave ${status}`);
    setCommentFor(null);
    setComment("");
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Attendance</h1>
        <p className="text-muted-foreground text-sm mt-1">Today's punches, hours, and leave approvals.</p>
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="leave">
            Leave approvals
            {data?.pending.length ? (
              <Badge className="ml-2" variant="secondary">{data.pending.length}</Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="font-display">Attendance overview</CardTitle>
                <CardDescription>Pick any date to see who's in, on leave, or missing.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(overviewDate, "EEE, d MMM yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="single"
                      selected={overviewDate}
                      onSelect={(d) => d && setOverviewDate(d)}
                      disabled={(d) => d > new Date()}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="sm" onClick={exportOverviewCsv} disabled={overviewRows.length === 0}>
                  <Download className="h-4 w-4 mr-1" /> Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <SummaryCard icon={<Users className="h-4 w-4" />} label="Total employees" value={counts.total} caption="in your scope" />
                <SummaryCard icon={<Plane className="h-4 w-4" />} label="On leave" value={counts.onLeave} caption={`of ${counts.total}`} tone="amber" />
                <SummaryCard icon={<LogIn className="h-4 w-4" />} label="Punched in" value={counts.punched} caption={`of ${counts.total}`} tone="green" />
                <SummaryCard icon={<UserX className="h-4 w-4" />} label="Not punched in" value={counts.notPunched} caption="excluding leave" tone="red" />
              </div>

              <Input
                placeholder="Search employee…"
                value={overviewSearch}
                onChange={(e) => setOverviewSearch(e.target.value)}
                className="max-w-xs"
              />

              <div className="rounded-lg border border-border/60 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Punch in</TableHead>
                      <TableHead>Punch out</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overviewRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                          No employees to show.
                        </TableCell>
                      </TableRow>
                    )}
                    {overviewRows.map(({ p, a, leave, status }) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.full_name ?? p.email}</TableCell>
                        <TableCell className="text-muted-foreground">{p.department ?? "—"}</TableCell>
                        <TableCell>
                          {status === "leave" ? (
                            <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 capitalize">
                              On leave · {leave!.leave_type}
                            </Badge>
                          ) : status === "in" ? (
                            <Badge className="gradient-primary">Punched in</Badge>
                          ) : status === "out" ? (
                            <Badge variant="secondary">Punched out</Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-600 border-red-500/40">Not punched in</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {a?.punch_in_time ? format(new Date(a.punch_in_time), "HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {a?.punch_out_time ? format(new Date(a.punch_out_time), "HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {a?.total_hours ? `${Number(a.total_hours).toFixed(2)}h` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="today" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Today · {format(new Date(), "EEE, MMM d")}</CardTitle>
              <CardDescription>Punch times and hours worked per teammate</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(() => {
                const onLeaveList = data?.onLeave ?? [];
                const onLeaveById = new Map(onLeaveList.map((l) => [l.user_id, l]));
                const nameById = new Map((data?.people ?? []).map((p) => [p.id, p]));
                const onLeaveNames = onLeaveList
                  .map((l) => nameById.get(l.user_id)?.full_name ?? nameById.get(l.user_id)?.email)
                  .filter(Boolean) as string[];
                return (
                  <>
                    {onLeaveNames.length > 0 && (
                      <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
                        <span className="font-medium">On leave today ({onLeaveNames.length}):</span>{" "}
                        <span className="text-muted-foreground">{onLeaveNames.join(" • ")}</span>
                      </div>
                    )}
                    {sortedPeople.length === 0 && (
                      <p className="text-sm text-muted-foreground">No teammates in your scope.</p>
                    )}
                    {sortedPeople.map((p) => {
                      const a = data?.todayAtt.find((x) => x.user_id === p.id);
                      const leave = onLeaveById.get(p.id);
                      const status = leave
                        ? "leave"
                        : a?.punch_in_time && !a.punch_out_time ? "in" : a?.punch_out_time ? "out" : "absent";
                      return (
                        <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs bg-primary/20">
                                {(p.full_name ?? p.email ?? "?").slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="text-sm font-medium">{p.full_name ?? p.email}</div>
                              <div className="text-xs text-muted-foreground">
                                {leave
                                  ? `On approved leave · ${format(new Date(leave.start_date), "d MMM")} – ${format(new Date(leave.end_date), "d MMM")}`
                                  : (
                                    <>
                                      {a?.punch_in_time ? `In at ${format(new Date(a.punch_in_time), "HH:mm")}` : "Not punched in"}
                                      {a?.punch_out_time ? ` · Out ${format(new Date(a.punch_out_time), "HH:mm")}` : ""}
                                    </>
                                  )}
                                {p.department ? ` · ${p.department}` : ""}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {!leave && a?.total_hours && (
                              <span className="text-xs font-mono text-muted-foreground">
                                {Number(a.total_hours).toFixed(2)}h
                              </span>
                            )}
                            {status === "leave" ? (
                              <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 capitalize">
                                On leave · {leave!.leave_type}
                              </Badge>
                            ) : (
                              <Badge
                                variant={status === "in" ? "default" : status === "out" ? "secondary" : "outline"}
                                className={status === "in" ? "gradient-primary" : ""}
                              >
                                {status === "in" ? "Punched in" : status === "out" ? "Signed off" : "Absent"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="leave" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Pending leave requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.pending.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">All caught up.</p>
              )}
              {data?.pending.map((r: {
                id: string;
                leave_type: string;
                days: number;
                start_date: string;
                end_date: string;
                reason?: string | null;
                user?: { full_name: string | null; email: string | null } | null;
              }) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 p-3"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {r.user?.full_name ?? r.user?.email ?? "Teammate"}
                      <span className="text-muted-foreground font-normal">
                        {" "}· <span className="capitalize">{r.leave_type}</span> · {r.days} day{Number(r.days) === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(r.start_date), "MMM d")} – {format(new Date(r.end_date), "MMM d, yyyy")}
                    </div>
                    {r.reason && <div className="text-xs mt-1">{r.reason}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Dialog
                      open={commentFor === r.id}
                      onOpenChange={(o) => {
                        setCommentFor(o ? r.id : null);
                        if (!o) setComment("");
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <X className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Reject leave</DialogTitle>
                        </DialogHeader>
                        <Textarea
                          placeholder="Optional reason"
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                        />
                        <DialogFooter>
                          <Button variant="destructive" onClick={() => decide(r.id, "rejected", comment)}>
                            Reject
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" className="gradient-primary" onClick={() => decide(r.id, "approved")}>
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  caption,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  caption?: string;
  tone?: "amber" | "green" | "red";
}) {
  const toneClass =
    tone === "amber" ? "text-amber-600 dark:text-amber-300"
    : tone === "green" ? "text-emerald-600 dark:text-emerald-300"
    : tone === "red" ? "text-red-600 dark:text-red-300"
    : "text-foreground";
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={toneClass}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {caption && <div className="text-xs text-muted-foreground mt-0.5">{caption}</div>}
    </div>
  );
}
