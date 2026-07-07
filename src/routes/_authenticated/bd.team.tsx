import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowRightCircle, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/bd/team")({ component: BDTeamPage });

type Person = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  reporting_manager_id: string | null;
  is_direct_report: boolean;
};

type Log = {
  id: string;
  log_date: string;
  user_id: string;
  activity_type_id: string;
  recurring_item_id: string | null;
  description: string;
  hours_spent: number | null;
  status: "pending" | "done" | "carried_forward";
  carried_forward_to: string | null;
  media_url: string | null;
  assigned_by: string | null;
  title: string | null;
};

type Recurring = { id: string; title: string };
type ActType = { id: string; name: string; is_active: boolean };

function BDTeamPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isManager = !!(me?.isAdmin || me?.isSuperAdmin || me?.isReportingManager);

  const { data: people } = useQuery({
    queryKey: ["bd-visible-users"],
    enabled: isManager,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("bd_list_visible_users");
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });

  const teammates = useMemo(() => (people ?? []).filter((p) => p.id !== me?.id), [people, me?.id]);
  const currentTarget = selectedId ?? teammates[0]?.id ?? null;

  const { data: types } = useQuery({
    queryKey: ["bd-types"],
    queryFn: async () => {
      const { data } = await supabase.from("bd_activity_types").select("*").eq("is_active", true).order("sort_order");
      return (data ?? []) as ActType[];
    },
  });

  const { data: recurring } = useQuery({
    queryKey: ["bd-recurring-for", currentTarget],
    enabled: !!currentTarget,
    queryFn: async () => {
      const { data } = await supabase
        .from("bd_recurring_items")
        .select("id, title")
        .eq("assignee_id", currentTarget!);
      return (data ?? []) as Recurring[];
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["bd-team-logs", currentTarget, date],
    enabled: !!currentTarget,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bd_activity_logs")
        .select("*")
        .eq("user_id", currentTarget!)
        .eq("log_date", date)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Log[];
    },
  });

  const typeById = useMemo(() => new Map((types ?? []).map((t) => [t.id, t])), [types]);
  const recById = useMemo(() => new Map((recurring ?? []).map((r) => [r.id, r])), [recurring]);

  const target = teammates.find((p) => p.id === currentTarget) ?? null;
  const pendingCount = (logs ?? []).filter((l) => l.status === "pending").length;
  const doneCount = (logs ?? []).filter((l) => l.status === "done").length;
  const totalHours = (logs ?? []).reduce((s, l) => s + Number(l.hours_spent ?? 0), 0);

  async function updateLog(id: string, patch: Partial<Log>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("bd_activity_logs").update(patch as any).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bd-team-logs", currentTarget, date] });
  }

  async function deleteLog(id: string) {
    const { error } = await supabase.from("bd_activity_logs").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bd-team-logs", currentTarget, date] });
  }

  async function rollPending() {
    if (!currentTarget) return;
    const pending = (logs ?? []).filter((l) => l.status === "pending");
    if (pending.length === 0) { toast.info("Nothing pending to roll."); return; }
    const tomorrow = format(addDays(parseISO(date), 1), "yyyy-MM-dd");
    const recurRows = pending
      .filter((p) => p.recurring_item_id)
      .map((p) => ({
        user_id: currentTarget,
        log_date: tomorrow,
        activity_type_id: p.activity_type_id,
        recurring_item_id: p.recurring_item_id,
        status: "pending" as const,
      }));
    const oneOffRows = pending
      .filter((p) => !p.recurring_item_id)
      .map((p) => ({
        user_id: currentTarget,
        log_date: tomorrow,
        activity_type_id: p.activity_type_id,
        title: p.title,
        description: p.description,
        hours_spent: p.hours_spent,
        assigned_by: p.assigned_by,
        status: "pending" as const,
      }));
    if (recurRows.length) {
      await supabase.from("bd_activity_logs").upsert(recurRows, {
        onConflict: "user_id,log_date,recurring_item_id",
        ignoreDuplicates: true,
      });
    }
    if (oneOffRows.length) {
      await supabase.from("bd_activity_logs").insert(oneOffRows);
    }
    await supabase
      .from("bd_activity_logs")
      .update({ status: "carried_forward", carried_forward_to: tomorrow })
      .in("id", pending.map((p) => p.id));
    toast.success(`Rolled ${pending.length} item${pending.length === 1 ? "" : "s"} to ${tomorrow}`);
    qc.invalidateQueries({ queryKey: ["bd-team-logs", currentTarget, date] });
  }

  if (!isManager) return <p className="text-sm text-muted-foreground">Managers only.</p>;
  if (teammates.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No teammates in your reporting tree yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Teammate list */}
      <Card className="lg:sticky lg:top-4 self-start">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Team</CardTitle>
        </CardHeader>
        <CardContent className="p-2 space-y-1">
          {[
            { label: "Direct reports", list: teammates.filter((t) => t.is_direct_report) },
            { label: "Extended team", list: teammates.filter((t) => !t.is_direct_report) },
          ].map((group) =>
            group.list.length === 0 ? null : (
              <div key={group.label} className="pt-1">
                <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{group.label}</div>
                {group.list.map((p) => {
                  const active = p.id === currentTarget;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-muted transition ${active ? "bg-muted font-medium" : ""}`}
                    >
                      <div className="truncate">{p.full_name ?? p.email}</div>
                      {p.department && <div className="text-[10px] text-muted-foreground truncate">{p.department}</div>}
                    </button>
                  );
                })}
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Selected teammate day */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">{target?.full_name ?? target?.email ?? "—"}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(date), "EEEE, d MMM yyyy")} · {pendingCount} pending · {doneCount} done · {totalHours.toFixed(1)}h logged
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
              <AssignOneOff
                target={currentTarget}
                types={types ?? []}
                onDone={() => qc.invalidateQueries({ queryKey: ["bd-team-logs", currentTarget, date] })}
                defaultDate={date}
              />
              <Button variant="outline" size="sm" onClick={rollPending}>
                <ArrowRightCircle className="h-4 w-4 mr-1" />
                Roll pending
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {(logs ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No items for this day yet.</p>
            )}
            {(logs ?? []).map((l) => {
              const rec = l.recurring_item_id ? recById.get(l.recurring_item_id) : null;
              const type = typeById.get(l.activity_type_id);
              const title = rec?.title ?? l.title ?? l.description ?? "(no title)";
              const isOneOff = !l.recurring_item_id;
              const carried = l.status === "carried_forward";
              const done = l.status === "done";
              return (
                <div key={l.id} className={`flex flex-wrap items-start gap-3 rounded-md border p-3 ${carried ? "opacity-60" : ""}`}>
                  <Checkbox
                    checked={done}
                    disabled={carried}
                    onCheckedChange={(v) => updateLog(l.id, { status: v ? "done" : "pending" })}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{title}</span>
                      {type?.name && <Badge variant="secondary" className="text-[10px]">{type.name}</Badge>}
                      {isOneOff && <Badge variant="outline" className="text-[10px]">One-off</Badge>}
                      {carried && <Badge variant="outline" className="text-[10px]">Carried → {l.carried_forward_to}</Badge>}
                    </div>
                    {l.description && <p className="text-xs text-muted-foreground mt-1">{l.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      placeholder="hrs"
                      defaultValue={l.hours_spent ?? ""}
                      onBlur={(e) => {
                        const raw = e.target.value;
                        const n = raw === "" ? null : Number(raw);
                        if (n !== l.hours_spent) updateLog(l.id, { hours_spent: n });
                      }}
                      className="w-20 h-8 text-sm"
                      disabled={carried}
                    />
                    <Button variant="ghost" size="icon" onClick={() => deleteLog(l.id)} disabled={carried}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AssignOneOff({
  target,
  types,
  onDone,
  defaultDate,
}: {
  target: string | null;
  types: ActType[];
  onDone: () => void;
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [typeId, setTypeId] = useState<string>("");
  const [hours, setHours] = useState<string>("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState<string>(defaultDate);

  function reset() {
    setTitle(""); setTypeId(""); setHours(""); setDescription(""); setDate(defaultDate);
  }

  async function submit() {
    if (!target) return;
    if (!title.trim() || !typeId) {
      toast.error("Title and activity type are required.");
      return;
    }
    const { error } = await supabase.from("bd_activity_logs").insert({
      user_id: target,
      log_date: date,
      activity_type_id: typeId,
      title: title.trim(),
      description: description.trim(),
      hours_spent: hours === "" ? null : Number(hours),
      status: "pending",
    });
    if (error) return toast.error(error.message);
    toast.success("Task assigned");
    reset();
    setOpen(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); if (v) setDate(defaultDate); }}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!target}><Plus className="h-4 w-4 mr-1" />Assign task</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign a one-off task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call Acme Corp about renewal" />
          </div>
          <div>
            <Label>Activity type</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Est. hours (optional)</Label>
              <Input type="number" step="0.25" min="0" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Context for your teammate" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
          <Button onClick={submit}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
