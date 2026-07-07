import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { setUserActive, deleteUserPermanently } from "@/lib/admin-users.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil, Users, Search, UserX, UserCheck, Trash2 } from "lucide-react";
import { useVisibilityScope } from "@/hooks/use-visibility-scope";


export const Route = createFileRoute("/_authenticated/directory")({
  component: DirectoryPage,
});

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  reporting_manager_id: string | null;
  employment_type: string | null;
  phone: string | null;
  joined_on: string | null;
  is_active: boolean | null;
};

const EMPLOYMENT_TYPES = ["full_time", "intern", "contract", "consultant"] as const;

const UNSET = "__unset__";

function DirectoryPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<"active" | "inactive" | "all">("active");
  const [editing, setEditing] = useState<Profile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const setActiveFn = useServerFn(setUserActive);
  const deleteFn = useServerFn(deleteUserPermanently);

  const canView = !!me && (me.isSuperAdmin || me.isAdmin || me.isHrAdmin || me.isDepartmentHead || me.isReportingManager);
  const canEdit = !!me && (me.isSuperAdmin || me.isHrAdmin);
  const canHardDelete = !!me && me.isSuperAdmin;


  const { deptScope, userScope } = useVisibilityScope(me);

  const { data: profiles } = useQuery({
    queryKey: ["directory-profiles", deptScope?.join(",") ?? "all", userScope?.join(",") ?? "all"],
    enabled: canView,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("profiles")
        .select("id, full_name, email, department, reporting_manager_id, employment_type, phone, joined_on, is_active")
        .order("full_name");
      if (deptScope && deptScope.length) q = q.in("department", deptScope);
      if (userScope && userScope.length) q = q.in("id", userScope);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["directory-departments"],
    enabled: canView,
    queryFn: async () => {
      const { data } = await supabase
        .from("taxonomy_departments")
        .select("id, name")
        .eq("active", true)
        .order("name");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  // For the "reporting manager" dropdown super/HR admins pick from — full list
  // regardless of scope.
  const { data: managerChoices } = useQuery({
    queryKey: ["directory-manager-choices"],
    enabled: canEdit,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (profiles ?? []).forEach((p) => m.set(p.id, p.full_name || p.email || "—"));
    (managerChoices ?? []).forEach((p) => m.set(p.id, p.full_name || p.email || "—"));
    return m;
  }, [profiles, managerChoices]);

  const allDepts = useMemo(() => {
    const s = new Set<string>();
    (profiles ?? []).forEach((p) => p.department && s.add(p.department));
    (departments ?? []).forEach((d) => s.add(d.name));
    return Array.from(s).sort();
  }, [profiles, departments]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Defensive de-dup by id, then by lower(email). If two entries collide,
    // prefer the active, non-placeholder one.
    const score = (p: Profile) =>
      (p.is_active === false ? 0 : 2) +
      ((p as unknown as { is_placeholder?: boolean }).is_placeholder ? 0 : 1);
    const byKey = new Map<string, Profile>();
    for (const p of profiles ?? []) {
      const keys = [p.id, (p.email ?? "").toLowerCase()].filter(Boolean) as string[];
      const existing = keys.map((k) => byKey.get(k)).find(Boolean);
      if (!existing || score(p) > score(existing)) {
        for (const k of keys) byKey.set(k, p);
      }
    }
    const unique = Array.from(new Set(Array.from(byKey.values())));
    return unique.filter((p) => {
      if (activeFilter === "active" && p.is_active === false) return false;
      if (activeFilter === "inactive" && p.is_active !== false) return false;
      if (deptFilter !== "all" && (p.department ?? "") !== deptFilter) return false;
      if (!q) return true;
      return (
        (p.full_name ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.department ?? "").toLowerCase().includes(q)
      );
    });
  }, [profiles, search, deptFilter, activeFilter]);


  if (me && !canView) throw redirect({ to: "/dashboard" });

  async function save() {
    if (!editing || !canEdit) return;
    const payload = {
      full_name: editing.full_name,
      department: editing.department,
      reporting_manager_id: editing.reporting_manager_id,
      employment_type: editing.employment_type,
      phone: editing.phone,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("profiles").update(payload).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["directory-profiles"] });
  }

  async function toggleActive(p: Profile, active: boolean) {
    if (!canEdit) return;
    setBusy(true);
    try {
      await setActiveFn({ data: { user_id: p.id, active } });
      toast.success(active ? "Reactivated" : "Deactivated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["directory-profiles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function hardDelete() {
    if (!confirmDelete || !canHardDelete) return;
    if (deleteConfirmText.trim().toLowerCase() !== (confirmDelete.email ?? "").toLowerCase()) {
      toast.error("Email does not match");
      return;
    }
    setBusy(true);
    try {
      await deleteFn({ data: { user_id: confirmDelete.id } });
      toast.success("User permanently deleted");
      setConfirmDelete(null);
      setDeleteConfirmText("");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["directory-profiles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" /> Employee Directory
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {canEdit ? "Edit teammates, departments, and reporting managers." : "Your team roster."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search name, email, department"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 w-64"
            />
          </div>
          <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as "active" | "inactive" | "all")}>
            <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {allDepts.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{rows.length} teammates</CardTitle>
          <CardDescription>
            {canEdit ? "Click a row to update department, reporting manager, or employment details." : "Scoped to your team."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teammate</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Reporting manager</TableHead>
                <TableHead>Employment</TableHead>
                <TableHead>Joined</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id} className={p.is_active === false ? "opacity-60" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-primary/20">
                          {(p.full_name ?? p.email ?? "?").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm font-medium flex items-center gap-2">
                          {p.full_name ?? "—"}
                          {p.is_active === false && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Inactive</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{p.email ?? "—"}</div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-sm">
                    {p.department ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.reporting_manager_id ? (
                      nameById.get(p.reporting_manager_id) ?? "—"
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.employment_type ? (
                      <Badge variant="outline" className="capitalize">
                        {p.employment_type.replace("_", " ")}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.joined_on ?? "—"}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        {canHardDelete && p.is_active === false && p.id !== me?.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => { setConfirmDelete(p); setDeleteConfirmText(""); }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 6 : 5} className="text-center text-sm text-muted-foreground py-8">
                    No teammates match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {editing?.full_name ?? editing?.email}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <Field label="Full name">
                <Input
                  value={editing.full_name ?? ""}
                  onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                />
              </Field>
              <Field label="Department">
                <Select
                  value={editing.department ?? UNSET}
                  onValueChange={(v) => setEditing({ ...editing, department: v === UNSET ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Pick a department" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET}>— None —</SelectItem>
                    {(departments ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Reporting manager">
                <Select
                  value={editing.reporting_manager_id ?? UNSET}
                  onValueChange={(v) => setEditing({ ...editing, reporting_manager_id: v === UNSET ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Pick a manager" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={UNSET}>— None —</SelectItem>
                    {(managerChoices ?? [])
                      .filter((m) => m.id !== editing.id)
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.full_name ?? m.email ?? "—"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Employment type">
                <Select
                  value={editing.employment_type ?? UNSET}
                  onValueChange={(v) => setEditing({ ...editing, employment_type: v === UNSET ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Pick a type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET}>— None —</SelectItem>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Phone">
                <Input
                  value={editing.phone ?? ""}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                />
              </Field>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              {editing && editing.id !== me?.id && (
                editing.is_active === false ? (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => toggleActive(editing, true)}>
                    <UserCheck className="h-3.5 w-3.5 mr-1" /> Reactivate
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => toggleActive(editing, false)}>
                    <UserX className="h-3.5 w-3.5 mr-1" /> Deactivate
                  </Button>
                )
              )}
              {canHardDelete && editing && editing.id !== me?.id && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => { setConfirmDelete(editing); setDeleteConfirmText(""); }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete permanently
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button className="gradient-primary" onClick={save} disabled={busy}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) { setConfirmDelete(null); setDeleteConfirmText(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Permanently delete user
            </DialogTitle>
            <DialogDescription>
              This wipes the user's auth login, profile, attendance, leave, salary, and all related records.
              This action <strong>cannot be undone</strong>. Consider Deactivate instead.
            </DialogDescription>
          </DialogHeader>
          {confirmDelete && (
            <div className="space-y-2">
              <p className="text-sm">
                Type <span className="font-mono font-semibold">{confirmDelete.email}</span> to confirm:
              </p>
              <Input
                autoFocus
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={confirmDelete.email ?? ""}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmDelete(null); setDeleteConfirmText(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={hardDelete} disabled={busy}>
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
