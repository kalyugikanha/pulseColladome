import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/bd/activity-types")({ component: BDTypesPage });

type ActType = { id: string; name: string; is_active: boolean; sort_order: number };

function BDTypesPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const isAdmin = !!(me?.isAdmin || me?.isSuperAdmin);

  const { data: types } = useQuery({
    queryKey: ["bd-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bd_activity_types").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as ActType[];
    },
  });

  if (!isAdmin) return <p className="text-sm text-muted-foreground">Admins only.</p>;

  async function add() {
    if (!name.trim()) return;
    const nextOrder = (types?.[types.length - 1]?.sort_order ?? 0) + 10;
    const { error } = await supabase.from("bd_activity_types").insert({ name: name.trim(), sort_order: nextOrder });
    if (error) toast.error(error.message);
    else { setName(""); qc.invalidateQueries({ queryKey: ["bd-types"] }); }
  }

  async function toggle(t: ActType, v: boolean) {
    const { error } = await supabase.from("bd_activity_types").update({ is_active: v }).eq("id", t.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bd-types"] });
  }

  async function rename(t: ActType, v: string) {
    if (!v.trim() || v === t.name) return;
    const { error } = await supabase.from("bd_activity_types").update({ name: v.trim() }).eq("id", t.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bd-types"] });
  }

  async function remove(t: ActType) {
    if (!confirm(`Delete "${t.name}"? This fails if any logs reference it.`)) return;
    const { error } = await supabase.from("bd_activity_types").delete().eq("id", t.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bd-types"] });
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Activity types</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input placeholder="New activity type" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()} />
          <Button onClick={add}><Plus className="h-4 w-4 mr-2" />Add</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-32">Active</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(types ?? []).map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <Input defaultValue={t.name} onBlur={(e) => rename(t, e.target.value)} className="h-8" />
                </TableCell>
                <TableCell>
                  <Switch checked={t.is_active} onCheckedChange={(v) => toggle(t, v)} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => remove(t)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
