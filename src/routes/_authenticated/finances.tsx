import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Wallet, IndianRupee, Users, UserPlus, Loader2 } from "lucide-react";
import { provisionPendingUsers } from "@/lib/admin-users.functions";
import { MultiSelectFilter, UNASSIGNED } from "@/components/multi-select-filter";

export const Route = createFileRoute("/_authenticated/finances")({
  component: FinancesPage,
});

type Profile = { id: string; full_name: string | null; email: string | null; department: string | null };
type Salary = { id: string; user_id: string; monthly_salary: number; currency: string; effective_from: string };
type Grant = { email: string; role: string; default_monthly_salary: number | null };
type LogRow = { user_id: string; date: string; tasks: Array<{ project_code?: string; project_name?: string; hours?: number }> | null };

function monthKey(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

function FinancesPage() {
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => monthKey(new Date()));

  const { data: profiles } = useQuery({
    queryKey: ["finances-profiles"],
    enabled: !!me?.isFinanceAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const { data: grants } = useQuery({
    queryKey: ["finances-grants"],
    enabled: !!me?.isFinanceAdmin,
    queryFn: async () => (await supabase.from("role_grants").select("email, role, default_monthly_salary").order("email")).data as Grant[] ?? [],
  });

  const { data: salaries } = useQuery({
    queryKey: ["finances-salaries"],
    enabled: !!me?.isFinanceAdmin,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("salaries")
        .select("id, user_id, monthly_salary, currency, effective_from")
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Salary[];
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["finances-logs", month],
    enabled: !!me?.isFinanceAdmin,
    queryFn: async () => {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("attendance_logs")
        .select("user_id, date, tasks")
        .gte("date", start)
        .lt("date", end);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  // Latest effective salary per user as of selected month
  const currentSalaryByUser = useMemo(() => {
    const map = new Map<string, Salary>();
    if (!salaries) return map;
    const [y, m] = month.split("-").map(Number);
    const cutoff = new Date(Date.UTC(y, m, 0)); // last day of selected month
    for (const s of salaries) {
      if (new Date(s.effective_from) > cutoff) continue;
      const existing = map.get(s.user_id);
      if (!existing || new Date(s.effective_from) > new Date(existing.effective_from)) map.set(s.user_id, s);
    }
    return map;
  }, [salaries, month]);

  // Compute per-project burn using salary-share allocation
  const burnByProject = useMemo(() => {
    const result = new Map<string, { code: string; name: string; burn: number; hours: number }>();
    if (!logs) return result;
    // Aggregate hours per (user, project) and per user total
    const userHoursByProject = new Map<string, Map<string, { hours: number; name: string }>>();
    const userTotalHours = new Map<string, number>();
    for (const row of logs) {
      const tasks = row.tasks ?? [];
      for (const t of tasks) {
        const code = t.project_code?.trim();
        const hrs = Number(t.hours) || 0;
        if (!code || hrs <= 0) continue;
        if (!userHoursByProject.has(row.user_id)) userHoursByProject.set(row.user_id, new Map());
        const inner = userHoursByProject.get(row.user_id)!;
        const prev = inner.get(code);
        inner.set(code, { hours: (prev?.hours ?? 0) + hrs, name: t.project_name || prev?.name || code });
        userTotalHours.set(row.user_id, (userTotalHours.get(row.user_id) ?? 0) + hrs);
      }
    }
    // Salary-share allocation
    for (const [userId, projMap] of userHoursByProject) {
      const total = userTotalHours.get(userId) ?? 0;
      const salary = currentSalaryByUser.get(userId);
      if (!salary || total <= 0) continue;
      for (const [code, { hours, name }] of projMap) {
        const share = hours / total;
        const alloc = share * Number(salary.monthly_salary);
        const cur = result.get(code) ?? { code, name, burn: 0, hours: 0 };
        cur.burn += alloc;
        cur.hours += hours;
        cur.name = cur.name || name;
        result.set(code, cur);
      }
    }
    return result;
  }, [logs, currentSalaryByUser]);

  const totalBurn = useMemo(() => Array.from(burnByProject.values()).reduce((s, r) => s + r.burn, 0), [burnByProject]);
  const totalHours = useMemo(() => Array.from(burnByProject.values()).reduce((s, r) => s + r.hours, 0), [burnByProject]);
  const usersWithSalary = currentSalaryByUser.size;

  // Merge profiles + grants so uninvited-but-signed-up and invited-but-unsigned users both appear
  const profileEmails = useMemo(() => new Set((profiles ?? []).map((p) => p.email?.toLowerCase()).filter(Boolean) as string[]), [profiles]);
  const pendingGrants = useMemo(() => (grants ?? []).filter((g) => !profileEmails.has(g.email.toLowerCase())), [grants, profileEmails]);
  const grantByEmail = useMemo(() => {
    const m = new Map<string, Grant>();
    for (const g of grants ?? []) m.set(g.email.toLowerCase(), g);
    return m;
  }, [grants]);
  const nameFromEmail = (e: string) => e.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const totalConfiguredPool = useMemo(() => {
    let sum = 0;
    for (const p of profiles ?? []) {
      const s = currentSalaryByUser.get(p.id);
      if (s) sum += Number(s.monthly_salary);
      else if (p.email) sum += Number(grantByEmail.get(p.email.toLowerCase())?.default_monthly_salary ?? 0);
    }
    for (const g of pendingGrants) sum += Number(g.default_monthly_salary ?? 0);
    return sum;
  }, [profiles, currentSalaryByUser, grantByEmail, pendingGrants]);

  if (meLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!me?.isFinanceAdmin) {
    throw redirect({ to: "/dashboard" });
  }

  const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6" /> Finances</h1>
          <p className="text-sm text-muted-foreground">Salaries and monthly project burn (salary-share allocation).</p>
        </div>
        <div className="flex items-center gap-2">
          {me?.realIsSuperAdmin && <ProvisionButton pendingCount={pendingGrants.length} />}
          <Label htmlFor="month" className="text-xs text-muted-foreground">Month</Label>
          <Input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={<IndianRupee className="h-4 w-4" />} label="Total burn" value={inr(totalBurn)} sub={`${totalHours.toFixed(1)} hrs logged`} />
        <StatCard icon={<Wallet className="h-4 w-4" />} label="Configured pool" value={inr(totalConfiguredPool)} sub="all salaries incl. pending" />
        <StatCard icon={<Users className="h-4 w-4" />} label="Employees with salary" value={String(usersWithSalary)} sub={`${(profiles?.length ?? 0) + pendingGrants.length} on roster`} />
        <StatCard icon={<UserPlus className="h-4 w-4" />} label="Pending signups" value={String(pendingGrants.length)} sub="invite sent, not registered" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Salaries</CardTitle>
            <CardDescription>Every invited employee — pending signups show their configured salary but need to register first.</CardDescription>
          </div>
          <SalaryDialog profiles={profiles ?? []} onSaved={() => qc.invalidateQueries({ queryKey: ["finances-salaries"] })} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Monthly salary</TableHead>
                <TableHead>Effective from</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(profiles ?? []).map((p) => {
                const s = currentSalaryByUser.get(p.id);
                const grant = p.email ? grantByEmail.get(p.email.toLowerCase()) : undefined;
                const grantSalary = grant?.default_monthly_salary != null ? Number(grant.default_monthly_salary) : null;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.email}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/40">Active</Badge></TableCell>
                    <TableCell className="text-right">
                      {s ? inr(Number(s.monthly_salary))
                        : grantSalary != null ? <span className="text-muted-foreground">{inr(grantSalary)} <span className="text-[10px]">(from invite)</span></span>
                        : <span className="text-muted-foreground">Not set</span>}
                    </TableCell>
                    <TableCell>{s?.effective_from ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
              {pendingGrants.map((g) => (
                <TableRow key={g.email} className="opacity-70">
                  <TableCell className="font-medium">{nameFromEmail(g.email)}</TableCell>
                  <TableCell className="text-muted-foreground">{g.email}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/40">Pending signup</Badge></TableCell>
                  <TableCell className="text-right">
                    {g.default_monthly_salary != null ? inr(Number(g.default_monthly_salary)) : <span className="text-muted-foreground">Not set</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">On first login</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project burn — {month}</CardTitle>
          <CardDescription>Salary-share allocation: each user's monthly salary is distributed across projects in proportion to hours logged.</CardDescription>
        </CardHeader>
        <CardContent>
          {burnByProject.size === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No time logged this month for users with salaries set.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Burn</TableHead>
                  <TableHead className="text-right">% of total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(burnByProject.values()).sort((a, b) => b.burn - a.burn).map((r) => (
                  <TableRow key={r.code}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell className="text-right">{r.hours.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{inr(r.burn)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{totalBurn > 0 ? ((r.burn / totalBurn) * 100).toFixed(1) : "0"}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProvisionButton({ pendingCount }: { pendingCount: number }) {
  const qc = useQueryClient();
  const run = useServerFn(provisionPendingUsers);
  const mut = useMutation({
    mutationFn: () => run(),
    onSuccess: (res) => {
      const parts: string[] = [];
      if (res.created.length) parts.push(`${res.created.length} created`);
      if (res.skipped.length) parts.push(`${res.skipped.length} skipped`);
      if (res.errors.length) parts.push(`${res.errors.length} failed`);
      toast.success(`Provisioning done — ${parts.join(", ") || "nothing to do"}.`);
      if (res.errors.length) toast.error(res.errors.map((e) => `${e.email}: ${e.message}`).join("\n"));
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Provisioning failed"),
  });
  return (
    <Button size="sm" variant="outline" onClick={() => mut.mutate()} disabled={mut.isPending || pendingCount === 0}>
      {mut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1.5" />}
      Provision pending ({pendingCount})
    </Button>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">{icon}{label}</div>
        <div className="mt-2 text-2xl font-bold font-display">{value}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function SalaryDialog({ profiles, onSaved }: { profiles: Profile[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [effective, setEffective] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!userId || !amount) return toast.error("Employee and amount are required.");
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("salaries").insert({
        user_id: userId,
        monthly_salary: Number(amount),
        effective_from: effective,
      });
      if (error) throw error;
      toast.success("Salary saved.");
      onSaved();
      setOpen(false);
      setUserId(""); setAmount("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save salary");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">Set / update salary</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Set monthly salary</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Employee</Label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select employee…</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>Monthly salary (INR)</Label><Input type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1"><Label>Effective from</Label><Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
