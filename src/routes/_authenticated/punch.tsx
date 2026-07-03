import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Clock } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/punch")({
  component: PunchPage,
});

type TaskEntry = { project_id: string | null; project_code: string | null; project_name: string | null; hours: number; comments: string };

function PunchPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [entries, setEntries] = useState<TaskEntry[]>([{ project_id: null, project_code: null, project_name: null, hours: 0, comments: "" }]);
  const [dailyNote, setDailyNote] = useState("");
  const [nextActions, setNextActions] = useState("");

  const { data: log, refetch } = useQuery({
    queryKey: ["today-log", me?.id],
    enabled: !!me,
    queryFn: async () => (await supabase.from("attendance_logs").select("*").eq("user_id", me!.id).eq("date", today).maybeSingle()).data,
  });

  const { data: projects } = useQuery({
    queryKey: ["projects-for-log"],
    enabled: !!me,
    queryFn: async () => (await supabase.from("projects").select("id, code, name").order("code")).data ?? [],
  });

  const { data: history } = useQuery({
    queryKey: ["punch-history", me?.id],
    enabled: !!me,
    queryFn: async () => (await supabase.from("attendance_logs").select("date,total_hours,punch_in_time,punch_out_time").eq("user_id", me!.id).order("date", { ascending: false }).limit(14)).data ?? [],
  });

  const punchedIn = !!log?.punch_in_time && !log?.punch_out_time;

  async function punchIn() {
    const { error } = await supabase.from("attendance_logs").upsert({ user_id: me!.id, date: today, punch_in_time: new Date().toISOString() }, { onConflict: "user_id,date" });
    if (error) { toast.error(error.message); return; }
    toast.success("Punched in");
    qc.invalidateQueries(); refetch();
  }

  function openPunchOut() {
    setEntries([{ task_description: "", hours: 0 }]);
    setDailyNote(""); setNextActions("");
    setDialogOpen(true);
  }

  const totalHours = entries.reduce((s, e) => s + (Number(e.hours) || 0), 0);

  async function submitPunchOut() {
    const cleanEntries = entries.filter((e) => e.task_description.trim() && Number(e.hours) > 0);
    if (cleanEntries.length === 0) { toast.error("Log at least one task with hours."); return; }
    const now = new Date().toISOString();
    const computedTotal = totalHours || (log?.punch_in_time ? differenceInMinutes(new Date(), new Date(log.punch_in_time)) / 60 : 0);
    const { error } = await supabase.from("attendance_logs").update({
      punch_out_time: now,
      total_hours: Number(computedTotal.toFixed(2)),
      tasks: cleanEntries,
      daily_note: dailyNote || null,
      next_actions: nextActions || null,
    }).eq("user_id", me!.id).eq("date", today);
    if (error) { toast.error(error.message); return; }
    toast.success("Signed off — nice work today.");
    setDialogOpen(false);
    qc.invalidateQueries(); refetch();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Attendance</h1>
        <p className="text-muted-foreground text-sm mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
      </header>

      <Card className="shadow-elevated overflow-hidden">
        <div className="gradient-surface p-8 md:p-12 relative">
          <div aria-hidden className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Status</div>
              <div className="mt-2 flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${punchedIn ? "bg-success animate-pulse" : log?.punch_out_time ? "bg-muted-foreground" : "bg-warning"}`} />
                <span className="font-display text-2xl md:text-3xl font-bold">
                  {punchedIn ? `Punched in since ${format(new Date(log!.punch_in_time!), "HH:mm")}` : log?.punch_out_time ? `Signed off at ${format(new Date(log.punch_out_time), "HH:mm")}` : "Not punched in"}
                </span>
              </div>
              {log?.total_hours && <div className="mt-2 text-sm text-muted-foreground">Logged {Number(log.total_hours).toFixed(2)} hours today.</div>}
            </div>
            {log?.punch_out_time ? null : punchedIn ? (
              <Button size="lg" onClick={openPunchOut} className="gradient-primary shadow-glow text-base h-12 px-8">Punch out</Button>
            ) : (
              <Button size="lg" onClick={punchIn} className="gradient-primary shadow-glow text-base h-12 px-8">Punch in</Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Last 14 days</CardTitle><CardDescription>Your attendance history</CardDescription></CardHeader>
        <CardContent>
          {(history?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet — start with your first punch.</p>
          ) : (
            <div className="grid gap-2">
              {history!.map((h) => (
                <div key={h.date} className="flex items-center justify-between rounded-lg border border-border/60 p-3 text-sm">
                  <div className="font-medium">{format(new Date(h.date), "EEE, MMM d")}</div>
                  <div className="text-muted-foreground">{h.punch_in_time ? format(new Date(h.punch_in_time), "HH:mm") : "—"} → {h.punch_out_time ? format(new Date(h.punch_out_time), "HH:mm") : "—"}</div>
                  <Badge variant="outline">{h.total_hours ? `${Number(h.total_hours).toFixed(2)}h` : "open"}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">End-of-day log</DialogTitle>
            <DialogDescription>Break down today's work before you sign off.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tasks worked on</Label>
              {entries.map((e, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-6">
                    <Input placeholder="What did you work on?" value={e.task_description} onChange={(ev) => setEntries((p) => p.map((x, idx) => idx === i ? { ...x, task_description: ev.target.value } : x))} />
                  </div>
                  <div className="col-span-3">
                    <Select value={e.task_id ?? "other"} onValueChange={(v) => {
                      if (v === "other") setEntries((p) => p.map((x, idx) => idx === i ? { ...x, task_id: null, project_id: null } : x));
                      else {
                        const t = assignedTasks?.find((t) => t.id === v);
                        setEntries((p) => p.map((x, idx) => idx === i ? { ...x, task_id: v, project_id: t?.project_id ?? null, task_description: x.task_description || t?.title || "" } : x));
                      }
                    }}>
                      <SelectTrigger><SelectValue placeholder="Link task" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="other">Unassigned / Other</SelectItem>
                        {assignedTasks?.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="0.25" min="0" placeholder="hrs" value={e.hours || ""} onChange={(ev) => setEntries((p) => p.map((x, idx) => idx === i ? { ...x, hours: Number(ev.target.value) } : x))} />
                  </div>
                  <Button variant="ghost" size="icon" className="col-span-1" onClick={() => setEntries((p) => p.filter((_, idx) => idx !== i))} disabled={entries.length === 1}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setEntries((p) => [...p, { task_description: "", hours: 0 }])}><Plus className="h-4 w-4 mr-1" /> Add another task</Button>
              <div className="text-right text-sm text-muted-foreground">Total: <span className="font-semibold text-foreground">{totalHours.toFixed(2)} h</span></div>
            </div>
            <div className="space-y-2"><Label>What did you complete today?</Label><Textarea rows={3} value={dailyNote} onChange={(e) => setDailyNote(e.target.value)} placeholder="Quick recap…" /></div>
            <div className="space-y-2"><Label>What's next</Label><Textarea rows={3} value={nextActions} onChange={(e) => setNextActions(e.target.value)} placeholder="Pending items / plan for tomorrow…" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitPunchOut} className="gradient-primary">Confirm & punch out</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
