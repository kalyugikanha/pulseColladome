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
import { Plus, Trash2, Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  listTaxonomy, upsertDomain, deleteDomain, upsertDepartment, deleteDepartment,
  upsertTaskType, deleteTaskType, upsertPlatform,
} from "@/lib/tasks-plus.functions";

export const Route = createFileRoute("/_authenticated/admin/taxonomy")({ component: TaxonomyPage });

export function TaxonomyPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const listFn = useServerFn(listTaxonomy);
  const { data: tax } = useQuery({ queryKey: ["taxonomy"], queryFn: () => listFn() });
  const [selDomain, setSelDomain] = useState<string | null>(null);
  const [selDept, setSelDept] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newType, setNewType] = useState("");
  const [newPlatform, setNewPlatform] = useState("");

  const uDom = useServerFn(upsertDomain);
  const dDom = useServerFn(deleteDomain);
  const uDep = useServerFn(upsertDepartment);
  const dDep = useServerFn(deleteDepartment);
  const uType = useServerFn(upsertTaskType);
  const dType = useServerFn(deleteTaskType);
  const uPlat = useServerFn(upsertPlatform);

  type TypeRow = { id: string; name: string; department_id: string | null; is_custom: boolean; category?: string | null };
  const departments = useMemo(() => (tax?.departments ?? []).filter((d) => d.domain_id === selDomain), [tax, selDomain]);
  const types = useMemo(() => ((tax?.taskTypes ?? []) as TypeRow[]).filter((t) => t.department_id === selDept && (t.category ?? "general") !== "platform"), [tax, selDept]);
  const platforms = useMemo(() => ((tax?.taskTypes ?? []) as TypeRow[]).filter((t) => t.category === "platform"), [tax]);

  async function refresh() { await qc.invalidateQueries({ queryKey: ["taxonomy"] }); }

  if (!me?.isSuperAdmin && !me?.isAdmin && !me?.isDepartmentHead && !me?.isReportingManager) return <div className="p-8 text-muted-foreground">Not authorized.</div>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Taxonomy</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage Domains, Departments, Task Types, and Content Platforms centrally.</p>
      </header>

      <Tabs defaultValue="tree">
        <TabsList>
          <TabsTrigger value="tree">Domain → Department → Type</TabsTrigger>
          <TabsTrigger value="platforms"><Share2 className="h-3.5 w-3.5 mr-1" /> Platforms</TabsTrigger>
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
                <Button size="sm" onClick={async () => { if (!newDomain.trim()) return; await uDom({ data: { name: newDomain } }); setNewDomain(""); refresh(); toast.success("Added"); }}>
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

        <TabsContent value="platforms" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Content platforms</CardTitle>
              <p className="text-xs text-muted-foreground">Tag content-workflow tasks with one or more platforms. Used by the Content Calendar.</p>
            </CardHeader>
            <CardContent className="space-y-1">
              {platforms.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded px-2 py-1">
                  <span className="text-sm flex items-center gap-2">
                    <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {p.name}
                  </span>
                  <button onClick={async () => { if (confirm("Delete?")) { await dType({ data: { id: p.id } }); refresh(); } }}>
                    <Trash2 className="h-3 w-3 opacity-50 hover:opacity-100" />
                  </button>
                </div>
              ))}
              {platforms.length === 0 && <p className="text-xs text-muted-foreground">No platforms yet.</p>}
              <div className="flex gap-1 pt-2">
                <Input placeholder="New platform (e.g. TikTok)" value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} className="h-8 text-sm" />
                <Button size="sm" onClick={async () => { if (!newPlatform.trim()) return; await uPlat({ data: { name: newPlatform } }); setNewPlatform(""); refresh(); toast.success("Added"); }}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
