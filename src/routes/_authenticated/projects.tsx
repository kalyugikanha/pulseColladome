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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, FolderKanban, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [openProject, setOpenProject] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [logFor, setLogFor] = useState<{ id: string; code: string; name: string } | null>(null);

  const [pName, setPName] = useState(""); const [pCode, setPCode] = useState(""); const [pClient, setPClient] = useState(""); const [pDesc, setPDesc] = useState(""); const [pStatus, setPStatus] = useState<"active"|"on_hold"|"completed">("active");
  const [tTitle, setTTitle] = useState(""); const [tDesc, setTDesc] = useState(""); const [tDue, setTDue] = useState(""); const [tPri, setTPri] = useState<"low"|"medium"|"high">("medium"); const [tAssign, setTAssign] = useState<string>("");

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await supabase.from("projects").select("*, tasks(id,title,status,priority,due_date,assignee_id,assignee:profiles!tasks_assignee_profile_fkey(full_name))").order("created_at", { ascending: false })).data ?? [],
  });

  const { data: people } = useQuery({
    queryKey: ["profiles-all"],
    enabled: !!me?.isAdmin,
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email")).data ?? [],
  });

  const { data: timeLog } = useQuery({
    queryKey: ["project-time-log", logFor?.code],
    enabled: !!logFor && !!me?.isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("attendance_logs").select("date, user_id, tasks");
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email");
      const nameOf = (uid: string) => profs?.find((p) => p.id === uid)?.full_name ?? profs?.find((p) => p.id === uid)?.email ?? "Unknown";
      const rows: { date: string; user: string; hours: number; comments: string }[] = [];
      (data ?? []).forEach((log: any) => {
        (log.tasks ?? []).forEach((t: any) => {
          if (t.project_code === logFor!.code || t.project_id === logFor!.id) {
            rows.push({ date: log.date, user: nameOf(log.user_id), hours: Number(t.hours) || 0, comments: t.comments ?? "" });
          }
        });
      });
      return rows.sort((a, b) => b.date.localeCompare(a.date));
    },
  });
  const logTotal = (timeLog ?? []).reduce((s, r) => s + r.hours, 0);

  async function createProject() {
    if (!pName) return toast.error("Name required");
    if (!pCode.trim()) return toast.error("Project ID required (e.g. CLDM00XXX)");
    const { error } = await supabase.from("projects").insert({ code: pCode.trim().toUpperCase(), name: pName, client_name: pClient || null, description: pDesc || null, status: pStatus, start_date: format(new Date(), "yyyy-MM-dd"), created_by: me!.id });
    if (error) return toast.error(error.message);
    toast.success("Project created");
    setPName(""); setPCode(""); setPClient(""); setPDesc(""); setOpenProject(false);
    qc.invalidateQueries();
  }

  async function createTask(projectId: string) {
    if (!tTitle) return toast.error("Title required");
    const { error } = await supabase.from("tasks").insert({ project_id: projectId, title: tTitle, description: tDesc || null, due_date: tDue || null, priority: tPri, assignee_id: tAssign || null, created_by: me!.id });
    if (error) return toast.error(error.message);
    toast.success("Task assigned");
    setTTitle(""); setTDesc(""); setTDue(""); setTAssign(""); setOpenTask(null);
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">{me?.isAdmin ? "Create projects and assign tasks to the team." : "Projects you can log time against."}</p>
        </div>
        {me?.isAdmin && (
          <Dialog open={openProject} onOpenChange={setOpenProject}>
            <DialogTrigger asChild><Button className="gradient-primary"><Plus className="h-4 w-4 mr-1" /> New project</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">New project</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Project ID</Label><Input placeholder="CLDM00XXX" value={pCode} onChange={(e) => setPCode(e.target.value)} /></div>
                  <div className="space-y-1"><Label>Name</Label><Input value={pName} onChange={(e) => setPName(e.target.value)} /></div>
                </div>
                <div className="space-y-1"><Label>Client</Label><Input value={pClient} onChange={(e) => setPClient(e.target.value)} /></div>
                <div className="space-y-1"><Label>Description</Label><Textarea rows={3} value={pDesc} onChange={(e) => setPDesc(e.target.value)} /></div>
                <div className="space-y-1"><Label>Status</Label>
                  <Select value={pStatus} onValueChange={(v) => setPStatus(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="on_hold">On Hold</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={createProject} className="gradient-primary">Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </header>

      {(projects?.length ?? 0) === 0 && <Card><CardContent className="p-10 text-center text-muted-foreground">No projects yet.</CardContent></Card>}

      <div className="grid gap-4">
        {projects?.map((p: any) => (
          <Card key={p.id}>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="font-display flex items-center gap-2"><FolderKanban className="h-4 w-4 text-primary" />{p.name}</CardTitle>
                <CardDescription><span className="font-mono text-xs mr-2">{p.code}</span>· {p.client_name ?? "Internal"} · <Badge variant="outline" className="capitalize ml-1">{p.status.replace("_", " ")}</Badge></CardDescription>
              </div>
              {me?.isAdmin && (
                <Dialog open={openTask === p.id} onOpenChange={(o) => setOpenTask(o ? p.id : null)}>
                  <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Task</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle className="font-display">Assign task in {p.name}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1"><Label>Title</Label><Input value={tTitle} onChange={(e) => setTTitle(e.target.value)} /></div>
                      <div className="space-y-1"><Label>Description</Label><Textarea rows={2} value={tDesc} onChange={(e) => setTDesc(e.target.value)} /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label>Due date</Label><Input type="date" value={tDue} onChange={(e) => setTDue(e.target.value)} /></div>
                        <div className="space-y-1"><Label>Priority</Label>
                          <Select value={tPri} onValueChange={(v) => setTPri(v as any)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1"><Label>Assign to</Label>
                        <Select value={tAssign} onValueChange={setTAssign}>
                          <SelectTrigger><SelectValue placeholder="Team member" /></SelectTrigger>
                          <SelectContent>{people?.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter><Button onClick={() => createTask(p.id)} className="gradient-primary">Assign</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {p.description && <p className="text-sm text-muted-foreground mb-3">{p.description}</p>}
              <div className="grid gap-3 md:grid-cols-3">
                {(["todo","in_progress","done"] as const).map((col) => (
                  <div key={col} className="rounded-lg border border-border/60 bg-surface/40 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{col.replace("_"," ")}</div>
                    <div className="space-y-2">
                      {(p.tasks ?? []).filter((t: any) => t.status === col).map((t: any) => (
                        <div key={t.id} className="rounded-md border border-border/60 bg-card p-2 text-sm">
                          <div className="font-medium">{t.title}</div>
                          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{t.assignee?.full_name ?? "Unassigned"}</span>
                            <Badge variant="outline" className="capitalize">{t.priority}</Badge>
                          </div>
                        </div>
                      ))}
                      {(p.tasks ?? []).filter((t: any) => t.status === col).length === 0 && <div className="text-xs text-muted-foreground">—</div>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
