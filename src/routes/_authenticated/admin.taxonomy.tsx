import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  listTaxonomy, upsertDomain, deleteDomain, upsertDepartment, deleteDepartment,
  upsertTaskType, deleteTaskType, setRolePresets,
} from "@/lib/tasks-plus.functions";

export const Route = createFileRoute("/_authenticated/admin/taxonomy")({ component: Page });

function Page() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const listFn = useServerFn(listTaxonomy);
  const { data: tax } = useQuery({ queryKey: ["taxonomy"], queryFn: () => listFn() });
  const [selDomain, setSelDomain] = useState<string | null>(null);
  const [selDept, setSelDept] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newType, setNewType] = useState("");

  const uDom = useServerFn(upsertDomain);
  const dDom = useServerFn(deleteDomain);
  const uDep = useServerFn(upsertDepartment);
  const dDep = useServerFn(deleteDepartment);
  const uType = useServerFn(upsertTaskType);
  const dType = useServerFn(deleteTaskType);
  const setPresetsFn = useServerFn(setRolePresets);

  const departments = useMemo(() => (tax?.departments ?? []).filter((d) => d.domain_id === selDomain), [tax, selDomain]);
  const types = useMemo(() => (tax?.taskTypes ?? []).filter((t) => t.department_id === selDept), [tax, selDept]);

  async function refresh() { await qc.invalidateQueries({ queryKey: ["taxonomy"] }); }

  if (!me?.isSuperAdmin && !me?.isAdmin && !me?.isDepartmentHead) return <div className="p-8 text-muted-foreground">Not authorized.</div>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Taxonomy</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage Domains, Departments, and Task Types centrally.</p>
      </header>

      <Tabs defaultValue="tree">
        <TabsList>
          <TabsTrigger value="tree">Domain → Department → Type</TabsTrigger>
          <TabsTrigger value="presets">Role presets</TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="grid gap-4 md:grid-cols-3 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Domains</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {tax?.domains.map((d) => (
                <div key={d.id} className={`flex items-center justify-between rounded px-2 py-1 cursor-pointer ${selDomain===d.id?"bg-accent":""}`}
                  onClick={() => { setSelDomain(d.id); setSelDept(null); }}>
                  <span className="text-sm">{d.name}</span>
                  <button onClick={async (e) => { e.stopPropagation(); if (confirm("Delete?")) { await dDom({ data: { id: d.id } }); refresh(); } }}>
                    <Trash2 className="h-3 w-3 opacity-50 hover:opacity-100" />
                  </button>
                </div>
              ))}
              <div className="flex gap-1 pt-2">
                <Input placeholder="New domain" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} className="h-8 text-sm" />
                <Button size="sm" onClick={async () => { if (!newDomain.trim()) return; await uDom({ data: { name: newDomain } }); setNewDomain(""); refresh(); }}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Departments</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {!selDomain && <p className="text-xs text-muted-foreground">Pick a domain →</p>}
              {selDomain && departments.map((d) => (
                <div key={d.id} className={`flex items-center justify-between rounded px-2 py-1 cursor-pointer ${selDept===d.id?"bg-accent":""}`}
                  onClick={() => setSelDept(d.id)}>
                  <span className="text-sm">{d.name}</span>
                  <button onClick={async (e) => { e.stopPropagation(); if (confirm("Delete?")) { await dDep({ data: { id: d.id } }); refresh(); } }}>
                    <Trash2 className="h-3 w-3 opacity-50 hover:opacity-100" />
                  </button>
                </div>
              ))}
              {selDomain && (
                <div className="flex gap-1 pt-2">
                  <Input placeholder="New department" value={newDept} onChange={(e) => setNewDept(e.target.value)} className="h-8 text-sm" />
                  <Button size="sm" onClick={async () => { if (!newDept.trim()) return; await uDep({ data: { domainId: selDomain, name: newDept } }); setNewDept(""); refresh(); }}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Task types</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {!selDept && <p className="text-xs text-muted-foreground">Pick a department →</p>}
              {selDept && types.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded px-2 py-1">
                  <span className="text-sm flex items-center gap-2">
                    {t.name}
                    {t.is_custom && <Badge variant="outline" className="text-[10px]">custom</Badge>}
                  </span>
                  <button onClick={async () => { if (confirm("Delete?")) { await dType({ data: { id: t.id } }); refresh(); } }}>
                    <Trash2 className="h-3 w-3 opacity-50 hover:opacity-100" />
                  </button>
                </div>
              ))}
              {selDept && (
                <div className="flex gap-1 pt-2">
                  <Input placeholder="New task type" value={newType} onChange={(e) => setNewType(e.target.value)} className="h-8 text-sm" />
                  <Button size="sm" onClick={async () => { if (!newType.trim()) return; await uType({ data: { departmentId: selDept, name: newType } }); setNewType(""); refresh(); }}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="presets" className="mt-4">
          <RolePresetsEditor tax={tax} onSave={async (role, ids) => { await setPresetsFn({ data: { roleKey: role, taskTypeIds: ids } }); toast.success("Presets saved"); }} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RolePresetsEditor({ tax, onSave }: { tax: Awaited<ReturnType<typeof listTaxonomy>> | undefined; onSave: (role: string, ids: string[]) => Promise<void> }) {
  const [role, setRole] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const roleKeys = useMemo(() => {
    const deptNames = (tax?.departments ?? []).map((d) => d.name);
    return Array.from(new Set([...deptNames, "admin", "employee", "project_manager", "hr_admin"])).sort();
  }, [tax]);

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Default task types per role/department</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-3 items-end">
          <div className="space-y-1 flex-1"><span className="text-xs text-muted-foreground">Role or department</span>
            <Select value={role} onValueChange={(v) => { setRole(v); setSelected(new Set()); }}>
              <SelectTrigger><SelectValue placeholder="Pick role/department" /></SelectTrigger>
              <SelectContent>{roleKeys.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={() => role && onSave(role, Array.from(selected))} disabled={!role}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
        </div>
        {role && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
            {(tax?.taskTypes ?? []).map((t) => {
              const active = selected.has(t.id);
              return (
                <button key={t.id} onClick={() => {
                  const next = new Set(selected);
                  active ? next.delete(t.id) : next.add(t.id);
                  setSelected(next);
                }} className={`text-left text-sm rounded px-2 py-1 border ${active?"bg-primary/10 border-primary":"border-border"}`}>
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
