import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInCalendarDays } from "date-fns";

export const Route = createFileRoute("/_authenticated/leave")({
  component: LeavePage,
});


const TYPES = [
  { v: "casual", l: "Casual" },
  { v: "sick", l: "Sick" },
  { v: "earned", l: "Earned / Paid" },
  { v: "unpaid", l: "Unpaid" },
] as const;

function LeavePage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"casual"|"sick"|"earned"|"unpaid">("casual");
  const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [reason, setReason] = useState("");

  const { data } = useQuery({
    queryKey: ["leave", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const [balances, requests] = await Promise.all([
        supabase.from("leave_balances").select("*").eq("user_id", me!.id),
        supabase.rpc("get_my_leave_requests"),
      ]);
      return { balances: balances.data ?? [], requests: requests.data ?? [] };
    },
  });

  async function submit() {
    if (!start || !end) return toast.error("Pick dates");
    const days = differenceInCalendarDays(new Date(end), new Date(start)) + 1;
    if (days <= 0) return toast.error("End must be after start");
    const { error } = await supabase.from("leave_requests").insert({ user_id: me!.id, leave_type: type, start_date: start, end_date: end, days, reason });
    if (error) return toast.error(error.message);
    toast.success("Request submitted");
    setOpen(false); setStart(""); setEnd(""); setReason("");
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">Leave</h1>
          <p className="text-muted-foreground text-sm mt-1">Request time off and track your balances.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gradient-primary"><Plus className="h-4 w-4 mr-1" /> Request leave</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">New leave request</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1"><Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Start</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
                <div className="space-y-1"><Label>End</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label>Reason</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            </div>
            <DialogFooter><Button onClick={submit} className="gradient-primary">Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {TYPES.map((t) => {
          const b = data?.balances.find((x) => x.leave_type === t.v);
          const allocated = Number(b?.allocated ?? 0), used = Number(b?.used ?? 0);
          const remaining = Math.max(0, allocated - used);
          const pct = allocated ? Math.min(100, (used / allocated) * 100) : 0;
          return (
            <Card key={t.v}>
              <CardContent className="p-5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{t.l}</div>
                <div className="mt-2 flex items-baseline gap-1"><span className="font-display text-3xl font-bold">{remaining}</span><span className="text-xs text-muted-foreground">/ {allocated} days</span></div>
                <Progress value={pct} className="mt-3 h-1.5" />
                <div className="mt-1 text-xs text-muted-foreground">{used} used</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle className="font-display">Your requests</CardTitle><CardDescription>Recent activity</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {(data?.requests.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
          {data?.requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
              <div>
                <div className="text-sm font-medium capitalize">{r.leave_type} · {r.days} day{Number(r.days) === 1 ? "" : "s"}</div>
                <div className="text-xs text-muted-foreground">{format(new Date(r.start_date), "MMM d")} – {format(new Date(r.end_date), "MMM d, yyyy")}</div>
                {r.reason && <div className="text-xs text-muted-foreground mt-1">{r.reason}</div>}
                {r.admin_comment && <div className="text-xs mt-1"><span className="text-muted-foreground">Admin:</span> {r.admin_comment}</div>}
              </div>
              <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="capitalize">{r.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
