import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Paperclip, Plus, ArrowRightCircle, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/bd/")({ component: BDDayPage });

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

type Recurring = {
  id: string;
  title: string;
  activity_type_id: string;
  frequency: "daily" | "weekly";
  weekdays: number[];
  is_active: boolean;
};

type ActType = { id: string; name: string; is_active: boolean; sort_order: number };

function BDDayPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  const { data: types } = useQuery({
    queryKey: ["bd-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bd_activity_types").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as ActType[];
    },
  });

  const { data: recurring } = useQuery({
    queryKey: ["bd-recurring-mine", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bd_recurring_items")
        .select("*")
        .eq("assignee_id", me!.id)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as Recurring[];
    },
  });

  const { data: logs, refetch } = useQuery({
    queryKey: ["bd-logs", me?.id, date],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bd_activity_logs")
        .select("*")
        .eq("user_id", me!.id)
        .eq("log_date", date)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Log[];
    },
  });

  // Auto-generate recurring logs for the day
  useEffect(() => {
    if (!me || !recurring || !logs) return;
    const weekday = parseISO(date).getDay();
    const applicable = recurring.filter((r) =>
      r.frequency === "daily" || (r.frequency === "weekly" && r.weekdays.includes(weekday))
    );
    const existing = new Set(logs.filter((l) => l.recurring_item_id).map((l) => l.recurring_item_id));
    const missing = applicable.filter((r) => !existing.has(r.id));
    if (missing.length === 0) return;
    (async () => {
      const rows = missing.map((r) => ({
        user_id: me.id,
        log_date: date,
        activity_type_id: r.activity_type_id,
        recurring_item_id: r.id,
        status: "pending" as const,
      }));
      const { error } = await supabase.from("bd_activity_logs").insert(rows);
      if (error && !/duplicate|unique/i.test(error.message)) {
        toast.error("Failed to prepare today's items");
      }
      refetch();
    })();
  }, [me, recurring, logs, date, refetch]);

  const recById = useMemo(() => new Map((recurring ?? []).map((r) => [r.id, r])), [recurring]);
  const typeById = useMemo(() => new Map((types ?? []).map((t) => [t.id, t])), [types]);

  const recurringLogs = (logs ?? []).filter((l) => l.recurring_item_id);
  const adHocLogs = (logs ?? []).filter((l) => !l.recurring_item_id);
  const pendingCount = (logs ?? []).filter((l) => l.status === "pending").length;

  async function updateLog(id: string, patch: Partial<Log>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("bd_activity_logs").update(patch as any).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bd-logs", me?.id, date] });
  }

  async function deleteLog(id: string) {
    const { error } = await supabase.from("bd_activity_logs").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bd-logs", me?.id, date] });
  }

  async function rollPending() {
    if (!me) return;
    const pending = (logs ?? []).filter((l) => l.status === "pending" && l.recurring_item_id);
    if (pending.length === 0) {
      toast.info("Nothing pending to roll.");
      return;
    }
    const tomorrow = format(addDays(parseISO(date), 1), "yyyy-MM-dd");
    // Insert fresh rows for tomorrow (idempotent via unique index)
    const rows = pending.map((p) => ({
      user_id: me.id,
      log_date: tomorrow,
      activity_type_id: p.activity_type_id,
      recurring_item_id: p.recurring_item_id,
      status: "pending" as const,
    }));
    await supabase.from("bd_activity_logs").upsert(rows, {
      onConflict: "user_id,log_date,recurring_item_id",
      ignoreDuplicates: true,
    });
    await supabase
      .from("bd_activity_logs")
      .update({ status: "carried_forward", carried_forward_to: tomorrow })
      .in("id", pending.map((p) => p.id));
    toast.success(`Rolled ${pending.length} item${pending.length === 1 ? "" : "s"} to ${tomorrow}`);
    qc.invalidateQueries({ queryKey: ["bd-logs", me.id, date] });
  }

  async function uploadMedia(logId: string, file: File) {
    if (!me) return;
    const path = `${me.id}/${logId}-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("bd-activity-proof").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    await updateLog(logId, { media_url: path });
    toast.success("Attached");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <Label className="text-xs">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline">{pendingCount} pending</Badge>
          <Button variant="outline" size="sm" onClick={rollPending}>
            <ArrowRightCircle className="h-4 w-4 mr-2" />
            Roll pending to next day
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recurring items for {format(parseISO(date), "EEEE, MMM d")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recurringLogs.length === 0 && (
            <p className="text-sm text-muted-foreground">No recurring items for today.</p>
          )}
          {recurringLogs.map((l) => {
            const rec = recById.get(l.recurring_item_id!);
            const type = typeById.get(l.activity_type_id);
            return (
              <LogRow
                key={l.id}
                log={l}
                title={rec?.title ?? "(deleted)"}
                typeName={type?.name}
                onChange={(p) => updateLog(l.id, p)}
                onDelete={() => deleteLog(l.id)}
                onUpload={(f) => uploadMedia(l.id, f)}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Extra activities</CardTitle>
          <AddAdHoc types={types ?? []} onAdd={async (input) => {
            if (!me) return;
            const { error } = await supabase.from("bd_activity_logs").insert({
              user_id: me.id,
              log_date: date,
              activity_type_id: input.activity_type_id,
              description: input.description,
              hours_spent: input.hours,
              status: "done",
            });
            if (error) toast.error(error.message);
            else qc.invalidateQueries({ queryKey: ["bd-logs", me.id, date] });
          }} />
        </CardHeader>
        <CardContent className="space-y-2">
          {adHocLogs.length === 0 && <p className="text-sm text-muted-foreground">No extra activities logged.</p>}
          {adHocLogs.map((l) => {
            const type = typeById.get(l.activity_type_id);
            return (
              <LogRow
                key={l.id}
                log={l}
                title={l.description || "(no description)"}
                typeName={type?.name}
                onChange={(p) => updateLog(l.id, p)}
                onDelete={() => deleteLog(l.id)}
                onUpload={(f) => uploadMedia(l.id, f)}
                adHoc
              />
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function LogRow({
  log,
  title,
  typeName,
  onChange,
  onDelete,
  onUpload,
  adHoc,
}: {
  log: Log;
  title: string;
  typeName?: string;
  onChange: (patch: Partial<Log>) => void;
  onDelete: () => void;
  onUpload: (f: File) => void;
  adHoc?: boolean;
}) {
  const [hours, setHours] = useState<string>(log.hours_spent?.toString() ?? "");
  const [desc, setDesc] = useState<string>(log.description ?? "");

  useEffect(() => setHours(log.hours_spent?.toString() ?? ""), [log.hours_spent]);
  useEffect(() => setDesc(log.description ?? ""), [log.description]);

  const carried = log.status === "carried_forward";
  const done = log.status === "done";

  return (
    <div className={`flex flex-wrap items-start gap-3 rounded-md border p-3 ${carried ? "opacity-60" : ""}`}>
      <Checkbox
        checked={done}
        disabled={carried}
        onCheckedChange={(v) => onChange({ status: v ? "done" : "pending" })}
        className="mt-1"
      />
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{title}</span>
          {typeName && <Badge variant="secondary" className="text-[10px]">{typeName}</Badge>}
          {carried && <Badge variant="outline" className="text-[10px]">Carried → {log.carried_forward_to}</Badge>}
        </div>
        {!adHoc && (
          <Input
            className="mt-2 h-8 text-sm"
            placeholder="What did you do? (one line)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => desc !== log.description && onChange({ description: desc })}
            disabled={carried}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.25"
          min="0"
          placeholder="hrs"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          onBlur={() => {
            const n = hours === "" ? null : Number(hours);
            if (n !== log.hours_spent) onChange({ hours_spent: n });
          }}
          className="w-20 h-8 text-sm"
          disabled={carried}
        />
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            disabled={carried}
          />
          <Button variant="ghost" size="icon" asChild disabled={carried}>
            <span><Paperclip className={`h-4 w-4 ${log.media_url ? "text-primary" : ""}`} /></span>
          </Button>
        </label>
        <Button variant="ghost" size="icon" onClick={onDelete} disabled={carried}>
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

function AddAdHoc({ types, onAdd }: {
  types: ActType[];
  onAdd: (input: { activity_type_id: string; description: string; hours: number }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState<string>("");
  const [desc, setDesc] = useState("");
  const [hours, setHours] = useState("");

  async function submit() {
    if (!typeId || !desc.trim() || !hours) {
      toast.error("Type, description and hours are required.");
      return;
    }
    await onAdd({ activity_type_id: typeId, description: desc.trim(), hours: Number(hours) });
    setTypeId(""); setDesc(""); setHours(""); setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-2" />Add extra activity</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Log extra activity</p>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
        </div>
        <div>
          <Label className="text-xs">Activity type</Label>
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {types.filter((t) => t.is_active).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short note" />
        </div>
        <div>
          <Label className="text-xs">Hours</Label>
          <Input type="number" step="0.25" min="0" value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
        <Button className="w-full" onClick={submit}>Log</Button>
      </PopoverContent>
    </Popover>
  );
}
