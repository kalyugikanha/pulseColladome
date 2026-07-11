import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { createTeamUser, bulkProvisionTeam, syncMissingAuthAccounts } from "@/lib/admin-users.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, Trash2, UserPlus, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/access")({
  beforeLoad: () => { throw redirect({ to: "/hr-admin", search: { tab: "access" } }); },
});

type GrantRole = "admin" | "employee" | "project_manager" | "learning_admin";

export function AccessPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const createUserFn = useServerFn(createTeamUser);
  const bulkProvisionFn = useServerFn(bulkProvisionTeam);
  const syncMissingFn = useServerFn(syncMissingAuthAccounts);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{ created: string[]; updated: string[]; errors: { email: string; message: string }[] } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: string[]; alreadyOk: string[]; errors: { email: string; message: string }[] } | null>(null);

  // Grant-only form (existing)
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<GrantRole>("employee");
  const [isSuper, setIsSuper] = useState(false);
  const [gDept, setGDept] = useState("");

  // Create-account form (new)
  const [cFullName, setCFullName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cRole, setCRole] = useState<GrantRole>("employee");
  const [cIsSuper, setCIsSuper] = useState(false);
  const [cSalary, setCSalary] = useState("");
  const [cDept, setCDept] = useState("");
  const [creating, setCreating] = useState(false);

  if (me && !me.isSuperAdmin) throw redirect({ to: "/dashboard" });

  const { data: grants } = useQuery({
    queryKey: ["role-grants"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => (await supabase.from("role_grants").select("*").order("email")).data ?? [],
  });

  const { data: deptOptions } = useQuery({
    queryKey: ["access-departments"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => {
      const [{ data: p }, { data: g }] = await Promise.all([
        supabase.from("profiles").select("department"),
        supabase.from("role_grants").select("department"),
      ]);
      const s = new Set<string>();
      for (const r of (p ?? []) as { department: string | null }[]) if (r.department) s.add(r.department);
      for (const r of (g ?? []) as { department: string | null }[]) if (r.department) s.add(r.department);
      return Array.from(s).sort();
    },
  });

  const { data: heads } = useQuery({
    queryKey: ["access-department-heads"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => {
      const { data: dh } = await supabase.from("department_heads").select("department, user_id");
      const ids = (dh ?? []).map((r) => r.user_id);
      if (ids.length === 0) return {} as Record<string, string>;
      const { data: profs } = await supabase.from("profiles").select("id, email").in("id", ids);
      const emailToDept: Record<string, string> = {};
      for (const row of dh ?? []) {
        const p = (profs ?? []).find((x) => x.id === row.user_id);
        if (p?.email) emailToDept[p.email.toLowerCase()] = row.department;
      }
      return emailToDept;
    },
  });


  async function addGrant() {
    const em = email.trim().toLowerCase();
    if (!em || !em.includes("@")) return toast.error("Valid email required");
    const { error } = await supabase.from("role_grants").upsert({ email: em, role, is_super_admin: isSuper, department: gDept.trim() || null });
    if (error) return toast.error(error.message);
    toast.success(`${em} will become ${isSuper ? "super admin" : role} on sign-in`);
    setEmail(""); setIsSuper(false); setRole("employee"); setGDept("");
    qc.invalidateQueries({ queryKey: ["role-grants"] });
    qc.invalidateQueries({ queryKey: ["access-departments"] });
  }

  async function removeGrant(em: string) {
    const { error } = await supabase.from("role_grants").delete().eq("email", em);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["role-grants"] });
  }

  async function createAccount() {
    const em = cEmail.trim().toLowerCase();
    if (!em || !em.includes("@")) return toast.error("Valid email required");
    setCreating(true);
    try {
      const salary = cSalary.trim() ? Number(cSalary) : null;
      await createUserFn({ data: {
        email: em,
        full_name: cFullName.trim() || undefined,
        role: cRole,
        is_super_admin: cIsSuper,
        default_monthly_salary: salary,
        department: cDept.trim() || null,
      } });
      toast.success(`Account created for ${em}. Temporary password: Test@123 — they'll be asked to reset it on first sign-in.`);
      setCFullName(""); setCEmail(""); setCRole("employee"); setCIsSuper(false); setCSalary(""); setCDept("");
      qc.invalidateQueries({ queryKey: ["role-grants"] });
      qc.invalidateQueries({ queryKey: ["access-departments"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  async function runProvisioning() {
    setProvisioning(true);
    setProvisionResult(null);
    try {
      const res = await bulkProvisionFn();
      setProvisionResult(res);
      toast.success(`Provisioning done — ${res.created.length} created, ${res.updated.length} updated, ${res.errors.length} errors`);
      qc.invalidateQueries({ queryKey: ["role-grants"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Provisioning failed");
    } finally {
      setProvisioning(false);
    }
  }

  async function runSyncMissing() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncMissingFn();
      setSyncResult(res);
      toast.success(`Sync done — ${res.synced.length} created, ${res.alreadyOk.length} ok, ${res.errors.length} errors`);
      qc.invalidateQueries({ queryKey: ["role-grants"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-primary" /> Access & Roles</h1>
        <p className="text-muted-foreground text-sm mt-1">Super admin only — create team accounts or pre-assign roles by email.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Provision team from list</CardTitle>
          <CardDescription>Creates accounts for the full Colladome roster (temp password <code className="px-1 rounded bg-muted">Test@123</code>) and syncs roles, monthly salaries, and departments. Safe to re-run — existing users are updated, not duplicated.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button className="gradient-primary" onClick={runProvisioning} disabled={provisioning}>{provisioning ? "Provisioning…" : "Run provisioning"}</Button>
            <Button variant="outline" onClick={runSyncMissing} disabled={syncing}>{syncing ? "Syncing…" : "Sync missing accounts"}</Button>
          </div>
          {syncResult && (
            <div className="text-sm space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Synced: {syncResult.synced.length}</Badge>
                <Badge variant="outline">Already OK: {syncResult.alreadyOk.length}</Badge>
                <Badge variant={syncResult.errors.length ? "destructive" : "outline"}>Errors: {syncResult.errors.length}</Badge>
              </div>
              {syncResult.synced.length > 0 && <details open><summary className="cursor-pointer text-muted-foreground">Synced ({syncResult.synced.length})</summary><ul className="mt-1 pl-4 list-disc text-xs">{syncResult.synced.map((e) => <li key={e}>{e}</li>)}</ul></details>}
              {syncResult.errors.length > 0 && <details open><summary className="cursor-pointer text-destructive">Errors</summary><ul className="mt-1 pl-4 list-disc text-xs">{syncResult.errors.map((e) => <li key={e.email}><span className="font-mono">{e.email}</span>: {e.message}</li>)}</ul></details>}
            </div>
          )}
          {provisionResult && (
            <div className="text-sm space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Created: {provisionResult.created.length}</Badge>
                <Badge variant="outline">Updated: {provisionResult.updated.length}</Badge>
                <Badge variant={provisionResult.errors.length ? "destructive" : "outline"}>Errors: {provisionResult.errors.length}</Badge>
              </div>
              {provisionResult.created.length > 0 && <details><summary className="cursor-pointer text-muted-foreground">Created ({provisionResult.created.length})</summary><ul className="mt-1 pl-4 list-disc text-xs">{provisionResult.created.map((e) => <li key={e}>{e}</li>)}</ul></details>}
              {provisionResult.updated.length > 0 && <details><summary className="cursor-pointer text-muted-foreground">Updated ({provisionResult.updated.length})</summary><ul className="mt-1 pl-4 list-disc text-xs">{provisionResult.updated.map((e) => <li key={e}>{e}</li>)}</ul></details>}
              {provisionResult.errors.length > 0 && <details open><summary className="cursor-pointer text-destructive">Errors</summary><ul className="mt-1 pl-4 list-disc text-xs">{provisionResult.errors.map((e) => <li key={e.email}><span className="font-mono">{e.email}</span>: {e.message}</li>)}</ul></details>}
            </div>
          )}
        </CardContent>
      </Card>



      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" /> Create account</CardTitle>
          <CardDescription>Provision a new team member with the temporary password <code className="px-1 rounded bg-muted">Test@123</code>. They will be forced to set a new password before using the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-2 space-y-1"><Label>Full name</Label><Input placeholder="Akash Kumar" value={cFullName} onChange={(e) => setCFullName(e.target.value)} /></div>
            <div className="md:col-span-2 space-y-1"><Label>Email</Label><Input placeholder="name@colladome.in" value={cEmail} onChange={(e) => setCEmail(e.target.value)} /></div>
            <div className="space-y-1"><Label>Role</Label>
              <Select value={cRole} onValueChange={(v) => setCRole(v as GrantRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="project_manager">Project Manager</SelectItem>
                  <SelectItem value="learning_admin">Learning Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Monthly salary (INR)</Label><Input inputMode="numeric" placeholder="e.g. 40000" value={cSalary} onChange={(e) => setCSalary(e.target.value)} /></div>
            <div className="md:col-span-2 space-y-1"><Label>Department</Label>
              <Input list="dept-options" placeholder="Marketing, HR, …" value={cDept} onChange={(e) => setCDept(e.target.value)} />
            </div>
            <div className="md:col-span-2 space-y-1"><Label>Super admin</Label>
              <Select value={cIsSuper ? "yes" : "no"} onValueChange={(v) => setCIsSuper(v === "yes")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <datalist id="dept-options">
            {(deptOptions ?? []).map((d) => <option key={d} value={d} />)}
          </datalist>
          <div className="mt-4"><Button className="gradient-primary" onClick={createAccount} disabled={creating}>{creating ? "Creating…" : "Create account"}</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display">Grant a role (without creating an account)</CardTitle><CardDescription>Use this when the person will sign in themselves — they'll get this role automatically on first sign-in with the matching email.</CardDescription></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-2 space-y-1"><Label>Email</Label><Input placeholder="name@colladome.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1"><Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as GrantRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="project_manager">Project Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-1"><Label>Department</Label>
              <Input list="dept-options" placeholder="Marketing, HR, …" value={gDept} onChange={(e) => setGDept(e.target.value)} />
            </div>
            <div className="space-y-1"><Label>Super admin</Label>
              <Select value={isSuper ? "yes" : "no"} onValueChange={(v) => setIsSuper(v === "yes")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4"><Button variant="outline" onClick={addGrant}>Save grant</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display">Current grants</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(grants?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No grants yet.</p>}
          {(grants ?? [])
            .slice()
            .sort((a: { department: string | null; email: string }, b) => (a.department ?? "zzz").localeCompare(b.department ?? "zzz") || a.email.localeCompare(b.email))
            .map((g: { email: string; role: string; is_super_admin: boolean; department: string | null }) => (
            <div key={g.email} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <div className="text-sm font-medium">{g.email}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="capitalize">{g.role.replace("_", " ")}</Badge>
                  {g.department && <Badge variant="secondary">{g.department}</Badge>}
                  {heads?.[g.email.toLowerCase()] && (
                    <Badge className="gradient-primary"><Shield className="h-3 w-3 mr-1" />{heads[g.email.toLowerCase()]} Head</Badge>
                  )}
                  {g.is_super_admin && <Badge className="gradient-primary"><Shield className="h-3 w-3 mr-1" /> Super admin</Badge>}

                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeGrant(g.email)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

