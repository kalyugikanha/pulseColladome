import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/bd/recurring")({ component: BDRecurringPage });

type Recurring = {
  id: string;
  title: string;
  assignee_id: string;
  activity_type_id: string;
  frequency: "daily" | "weekly";
  weekdays: number[];
  is_active: boolean;
};
type Profile = { id: string; full_name: string | null; email: string | null };
type ActType = { id: string; name: string; is_active: boolean };

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function BDRecurringPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Recurring | null>(null);
  const [open, setOpen] = useState(false);

  const isManager = !!(me?.isAdmin || me?.isSuperAdmin || me?.isReportingManager);

  const { data: items } = useQuery({
    queryKey: ["bd-recurring-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bd_recurring_items").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as Recurring[];
    },
  });

  // Scope: pulls me + full reporting tree (admins get everyone) via SECURITY DEFINER RPC
  const { data: profiles } = useQuery({
    queryKey: ["bd-visible-users"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("bd_list_visible_users");
      if (error) throw error;
      return (data ?? []) as Array<Profile & { department: string | null; is_direct_report: boolean }>;
    },
  });

  const { data: types } = useQuery({
    queryKey: ["bd-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bd_activity_types").select("*").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return (data ?? []) as ActType[];
    },
  });

  if (!isManager) return <p className="text-sm text-muted-foreground">Only managers can manage recurring items.</p>;

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const typeById = new Map((types ?? []).map((t) => [t.id, t]));

  async function toggleActive(r: Recurring, v: boolean) {
    const { error } = await supabase.from("bd_recurring_items").update({ is_active: v }).eq("id", r.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bd-recurring-all"] });
  }

  async function remove(r: Recurring) {
    if (!confirm(`Delete "${r.title}"? Existing logs are kept but unlinked.`)) return;
    const { error } = await supabase.from("bd_recurring_items").delete().eq("id", r.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bd-recurring-all"] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Recurring items</CardTitle>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />New recurring item
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Activity type</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead className="w-24">Active</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(items ?? []).map((r) => {
              const p = profileById.get(r.assignee_id);
              const t = typeById.get(r.activity_type_id);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.title}</TableCell>
                  <TableCell>{p?.full_name ?? p?.email ?? "—"}</TableCell>
                  <TableCell>{t?.name ?? "—"}</TableCell>
                  <TableCell>
                    {r.frequency === "daily" ? (
                      <Badge variant="secondary">Daily</Badge>
                    ) : (
                      <div className="flex gap-1">
                        {DAY_LABELS.map((d, i) => (
                          <Badge key={i} variant={r.weekdays.includes(i) ? "default" : "outline"} className="text-[10px] px-1.5">{d}</Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell><Switch checked={r.is_active} onCheckedChange={(v) => toggleActive(r, v)} /></TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(r)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {(items ?? []).length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No recurring items yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <RecurringDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        profiles={profiles ?? []}
        types={types ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ["bd-recurring-all"] })}
        currentUserId={me?.id ?? null}
      />
    </Card>
  );
}

function RecurringDialog({
  open, onOpenChange, editing, profiles, types, onSaved, currentUserId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Recurring | null;
  profiles: Profile[];
  types: ActType[];
  onSaved: () => void;
  currentUserId: string | null;
}) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [typeId, setTypeId] = useState<string>("");
  const [freq, setFreq] = useState<"daily" | "weekly">("daily");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setAssignee(editing.assignee_id);
      setTypeId(editing.activity_type_id);
      setFreq(editing.frequency);
      setWeekdays(editing.weekdays);
      setActive(editing.is_active);
    } else {
      setTitle(""); setAssignee(""); setTypeId(""); setFreq("daily"); setWeekdays([1, 2, 3, 4, 5]); setActive(true);
    }
  }, [open, editing]);

  function reset() {
    setTitle(""); setAssignee(""); setTypeId(""); setFreq("daily"); setWeekdays([1, 2, 3, 4, 5]); setActive(true);
  }

  async function save() {
    if (!title.trim() || !assignee || !typeId) {
      toast.error("Title, assignee and activity type are required.");
      return;
    }
    const payload = {
      title: title.trim(),
      assignee_id: assignee,
      activity_type_id: typeId,
      frequency: freq,
      weekdays: freq === "weekly" ? weekdays : [],
      is_active: active,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("bd_recurring_items").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("bd_recurring_items").insert({ ...payload, created_by: currentUserId }));
    }
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit recurring item" : "New recurring item"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Follow up on inbound leads" />
          </div>
          <div>
            <Label>Assignee</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Activity type</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {types.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Frequency</Label>
            <Select value={freq} onValueChange={(v) => setFreq(v as "daily" | "weekly")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {freq === "weekly" && (
            <div>
              <Label>Days</Label>
              <div className="flex gap-1 mt-2">
                {DAY_LABELS.map((d, i) => {
                  const on = weekdays.includes(i);
                  return (
                    <Button
                      key={i}
                      type="button"
                      variant={on ? "default" : "outline"}
                      size="sm"
                      className="w-9"
                      onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== i) : [...weekdays, i].sort())}
                    >{d}</Button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} id="bd-active" />
            <Label htmlFor="bd-active">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
