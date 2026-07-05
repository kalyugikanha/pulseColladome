import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import { listTasksOverview } from "@/lib/tasks-plus.functions";

export const Route = createFileRoute("/_authenticated/tasks-overview")({ component: Page });

function Page() {
  const { data: me } = useCurrentUser();
  const canView = me?.canManageProjects || me?.isDepartmentHead || me?.isReportingManager || me?.isAdmin;

  const [employees, setEmployees] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!me || me.isAdmin || me.canManageProjects) return;
    if (me.isDepartmentHead && departments.length === 0) {
      setDepartments(me.headOfDepartments);
    }
    if (me.isReportingManager && employees.length === 0) {
      setEmployees(me.directReportIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const { data: profileList } = useQuery({
    queryKey: ["profiles-mini"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, department").order("full_name")).data ?? [],
  });
  const { data: projectList } = useQuery({
    queryKey: ["projects-list"],
    queryFn: async () => (await supabase.from("projects").select("id, name").order("name")).data ?? [],
  });

  const deptOptions = useMemo(() => {
    const set = new Set((profileList ?? []).map((p) => p.department).filter((d): d is string => !!d));
    return Array.from(set).sort().map((d) => ({ value: d, label: d }));
  }, [profileList]);

  const listFn = useServerFn(listTasksOverview);
  const { data: rows } = useQuery({
    queryKey: ["tasks-overview", employees, departments, projects, statuses, dateFrom, dateTo],
    enabled: !!canView,
    queryFn: () => listFn({ data: {
      employeeIds: employees, departments, projectIds: projects, statuses,
      dateFrom: dateFrom || null, dateTo: dateTo || null,
    }}),
  });

  function exportCsv() {
    const header = ["Task", "Assignee", "Department", "Project", "Domain", "Category", "Types", "Status", "Priority", "Due"].join(",");
    const escape = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
    const lines = (rows ?? []).map((r) => {
      const types = (r.task_types as { task_type: { name: string } | null }[] | null)?.map((x) => x.task_type?.name).filter(Boolean).join("|") ?? "";
      return [
        escape(r.title),
        escape((r.assignee as { full_name?: string } | null)?.full_name ?? ""),
        escape((r.assignee as { department?: string } | null)?.department ?? ""),
        escape((r.project as { name?: string } | null)?.name ?? ""),
        escape((r.domain as { name?: string } | null)?.name ?? ""),
        escape((r.department as { name?: string } | null)?.name ?? ""),
        escape(types),
        escape(r.status), escape(r.priority),
        escape(r.due_date ?? ""),
      ].join(",");
    });
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tasks-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!canView) return <div className="p-8 text-muted-foreground">You don't have access to this view.</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">Task Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">All tasks in one grid — filterable by employee, department, project, and date.</p>
        </div>
        <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-sm">Filters</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <MultiSelectFilter label="Employee" selected={new Set(employees)} onChange={(s) => setEmployees(Array.from(s))}
            options={(profileList ?? []).map((p) => ({ value: p.id, label: p.full_name ?? p.id }))} />
          <MultiSelectFilter label="Department" selected={new Set(departments)} onChange={(s) => setDepartments(Array.from(s))} options={deptOptions} />
          <MultiSelectFilter label="Project" selected={new Set(projects)} onChange={(s) => setProjects(Array.from(s))}
            options={(projectList ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <MultiSelectFilter label="Status" selected={new Set(statuses)} onChange={(s) => setStatuses(Array.from(s))}
            options={[{value:"todo",label:"To Do"},{value:"in_progress",label:"In Progress"},{value:"done",label:"Done"}]} />
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Task</th>
                <th className="text-left p-3">Assignee</th>
                <th className="text-left p-3">Department</th>
                <th className="text-left p-3">Project</th>
                <th className="text-left p-3">Types</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Priority</th>
                <th className="text-left p-3">Due</th>
                <th className="text-left p-3">Links</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => {
                const types = (r.task_types as { task_type: { id: string; name: string } | null }[] | null)?.map((x) => x.task_type).filter(Boolean) ?? [];
                const links = (r.asset_links as { label: string; url: string }[] | null) ?? [];
                return (
                  <tr key={r.id} className="border-t border-border/50">
                    <td className="p-3 font-medium">{r.title}</td>
                    <td className="p-3">{(r.assignee as { full_name?: string } | null)?.full_name ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{(r.assignee as { department?: string } | null)?.department ?? "—"}</td>
                    <td className="p-3">{(r.project as { name?: string } | null)?.name ?? "—"}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {types.map((tt) => <Badge key={tt!.id} variant="secondary">{tt!.name}</Badge>)}
                      </div>
                    </td>
                    <td className="p-3"><Badge variant="outline" className="capitalize">{r.status.replace("_", " ")}</Badge></td>
                    <td className="p-3"><Badge variant="outline" className="capitalize">{r.priority}</Badge></td>
                    <td className="p-3">{r.due_date ? format(new Date(r.due_date), "MMM d") : "—"}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        {links.map((l, i) => (
                          <a key={i} href={l.url} target="_blank" rel="noreferrer" className="text-primary"><ExternalLink className="h-3 w-3" /></a>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(rows?.length ?? 0) === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No tasks match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
