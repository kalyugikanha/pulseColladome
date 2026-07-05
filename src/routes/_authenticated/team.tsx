import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, X, Shield } from "lucide-react";

export const Route = createFileRoute("/_authenticated/team")({
  component: TeamPage,
});

function TeamPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const canView = !!me && (me.isAdmin || me.isDepartmentHead);
  const deptScope = !!me && !me.isAdmin && me.isDepartmentHead ? me.headOfDepartments : null;

  const { data } = useQuery({
    queryKey: ["team", me?.id, deptScope?.join(",") ?? "all"],
    enabled: canView,
    queryFn: async () => {
      let peopleQ = supabase.from("profiles").select("id, full_name, email, department");
      if (deptScope && deptScope.length) peopleQ = peopleQ.in("department", deptScope);
      const [people, todayAtt, roles] = await Promise.all([
        peopleQ,
        supabase.from("attendance_logs").select("user_id, punch_in_time, punch_out_time, total_hours").eq("date", today),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const peopleList = people.data ?? [];
      const nameById = new Map(peopleList.map((p) => [p.id, p]));
      const pendingReq = me?.isAdmin
        ? await supabase.rpc("admin_get_leave_requests", { _status: "pending" })
        : await supabase.from("leave_requests").select("*").eq("status", "pending");
      const pendingWithUser = (pendingReq.data ?? [])
        .filter((r: any) => !deptScope || nameById.has(r.user_id))
        .map((r: any) => ({
          ...r,
          user: nameById.get(r.user_id) ? { full_name: nameById.get(r.user_id)!.full_name, email: nameById.get(r.user_id)!.email } : null,
        }));
      return { people: peopleList, todayAtt: todayAtt.data ?? [], pending: pendingWithUser, roles: roles.data ?? [] };
    },
  });

  if (me && !canView) {
    throw redirect({ to: "/dashboard" });
  }

  async function decide(id: string, status: "approved" | "rejected", adminComment?: string) {
    const { error } = await supabase.from("leave_requests").update({ status, admin_comment: adminComment || null, decided_by: me!.id, decided_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Leave ${status}`);
    setCommentFor(null); setComment("");
    qc.invalidateQueries();
  }

  async function toggleAdmin(userId: string, makeAdmin: boolean) {
    if (makeAdmin) {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
      if (error) return toast.error(error.message);
    }
    toast.success("Role updated");
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Team</h1>
        <p className="text-muted-foreground text-sm mt-1">Attendance, approvals, and access.</p>
      </header>

      <Tabs defaultValue="attendance">
        <TabsList>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="leave">Leave approvals {data?.pending.length ? <Badge className="ml-2" variant="secondary">{data.pending.length}</Badge> : null}</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="font-display">Today · {format(new Date(), "EEE, MMM d")}</CardTitle><CardDescription>Live attendance snapshot</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {data?.people.map((p) => {
                const a = data.todayAtt.find((x) => x.user_id === p.id);
                const status = a?.punch_in_time && !a.punch_out_time ? "in" : a?.punch_out_time ? "out" : "absent";
                return (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8"><AvatarFallback className="text-xs bg-primary/20">{(p.full_name ?? p.email ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                      <div>
                        <div className="text-sm font-medium">{p.full_name ?? p.email}</div>
                        <div className="text-xs text-muted-foreground">{a?.punch_in_time ? `In at ${format(new Date(a.punch_in_time), "HH:mm")}` : "Not punched in"}{a?.punch_out_time ? ` · Out ${format(new Date(a.punch_out_time), "HH:mm")}` : ""}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {a?.total_hours && <span className="text-xs text-muted-foreground">{Number(a.total_hours).toFixed(2)}h</span>}
                      <Badge variant={status === "in" ? "default" : status === "out" ? "secondary" : "outline"} className={status === "in" ? "gradient-primary" : ""}>{status === "in" ? "Punched in" : status === "out" ? "Signed off" : "Absent"}</Badge>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="font-display">Pending leave requests</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(data?.pending.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">All caught up.</p>}
              {data?.pending.map((r: any) => (
                <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
                  <div>
                    <div className="text-sm font-medium">{r.user?.full_name ?? r.user?.email} <span className="text-muted-foreground font-normal">· <span className="capitalize">{r.leave_type}</span> · {r.days} day{Number(r.days) === 1 ? "" : "s"}</span></div>
                    <div className="text-xs text-muted-foreground">{format(new Date(r.start_date), "MMM d")} – {format(new Date(r.end_date), "MMM d, yyyy")}</div>
                    {r.reason && <div className="text-xs mt-1">{r.reason}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Dialog open={commentFor === r.id} onOpenChange={(o) => { setCommentFor(o ? r.id : null); if (!o) setComment(""); }}>
                      <DialogTrigger asChild><Button variant="outline" size="sm"><X className="h-4 w-4 mr-1" /> Reject</Button></DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Reject leave</DialogTitle></DialogHeader>
                        <Textarea placeholder="Optional reason" value={comment} onChange={(e) => setComment(e.target.value)} />
                        <DialogFooter><Button variant="destructive" onClick={() => decide(r.id, "rejected", comment)}>Reject</Button></DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" className="gradient-primary" onClick={() => decide(r.id, "approved")}><Check className="h-4 w-4 mr-1" /> Approve</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="font-display">Members & roles</CardTitle><CardDescription>Promote trusted teammates to Admin.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {data?.people.map((p) => {
                const isAdmin = data.roles.some((r) => r.user_id === p.id && r.role === "admin");
                const isSelf = p.id === me?.id;
                return (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8"><AvatarFallback className="text-xs bg-primary/20">{(p.full_name ?? p.email ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                      <div>
                        <div className="text-sm font-medium">{p.full_name ?? p.email}</div>
                        <div className="text-xs text-muted-foreground">{p.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && <Badge className="gradient-primary"><Shield className="h-3 w-3 mr-1" /> Admin</Badge>}
                      {!isSelf && me?.isAdmin && (
                        <Button size="sm" variant="outline" onClick={() => toggleAdmin(p.id, !isAdmin)}>{isAdmin ? "Revoke admin" : "Make admin"}</Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
