import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { Copy, Pencil, Plus, Trash2, Paperclip, Repeat, IndianRupee, Wallet } from "lucide-react";
import { DepartmentSelect } from "@/components/department-select";

export const EXPENSE_CATEGORIES = [
  { value: "software_subscriptions", label: "Software / Subscriptions" },
  { value: "travel", label: "Travel" },
  { value: "ai_tools", label: "AI Tools" },
  { value: "admin_utilities", label: "Admin / Utilities" },
  { value: "professional_fees", label: "Professional Fees" },
  { value: "other", label: "Other" },
] as const;

const PAYMENT_METHODS = [
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other", label: "Other" },
] as const;

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
] as const;

export type ExpenseScope = "project" | "department" | "company";
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];
export type RecurringFrequency = (typeof FREQUENCIES)[number]["value"];
export type ReimbursementStatus = "pending" | "paid" | "na";

export type Expense = {
  id: string;
  title: string;
  description: string | null;
  amount_inr: number;
  expense_date: string;
  category: ExpenseCategory;
  proof_path: string | null;
  recurring: boolean;
  recurring_frequency: RecurringFrequency | null;
  recurrence_end_date: string | null;
  scope: ExpenseScope;
  project_id: string | null;
  department: string | null;
  paid_by: string | null;
  payment_method: PaymentMethod | null;
  reimbursement_status: ReimbursementStatus;
  created_by: string | null;
  created_at: string;
};

type Project = { id: string; code: string; name: string; status: string };
type Profile = { id: string; full_name: string | null; email: string | null; is_active: boolean | null };

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const catLabel = (v: string) => EXPENSE_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const methodLabel = (v: string | null) => PAYMENT_METHODS.find((c) => c.value === v)?.label ?? "—";
const freqLabel = (v: string | null) => FREQUENCIES.find((c) => c.value === v)?.label ?? "";

/** Months-per-period used to divide the amount into a monthly-equivalent figure. */
export function monthlyEquivalent(e: Pick<Expense, "recurring" | "recurring_frequency" | "amount_inr">): number {
  const amt = Number(e.amount_inr) || 0;
  if (!e.recurring || !e.recurring_frequency) return amt;
  switch (e.recurring_frequency) {
    case "weekly": return amt * (52 / 12);
    case "monthly": return amt;
    case "quarterly": return amt / 3;
    case "yearly": return amt / 12;
    default: return amt;
  }
}

/** True if the recurring expense is active during the given calendar month (YYYY-MM). */
export function recurringActiveInMonth(e: Pick<Expense, "recurring" | "expense_date" | "recurrence_end_date">, monthKey: string): boolean {
  if (!e.recurring) return false;
  const monthStart = monthKey + "-01";
  const [y, m] = monthKey.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  if (e.expense_date > monthEnd) return false;
  if (e.recurrence_end_date && e.recurrence_end_date < monthStart) return false;
  return true;
}

function monthKeyOf(d: string) {
  return d.slice(0, 7);
}

export function ExpensesPanel() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [dialog, setDialog] = useState<{ mode: "create" | "edit" | "duplicate"; expense?: Expense } | null>(null);
  const [catFilter, setCatFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [recurringOnly, setRecurringOnly] = useState(false);

  const canView = !!me?.isAdmin || !!me?.isSuperAdmin;

  const { data: profiles = [] } = useQuery({
    queryKey: ["expenses-profiles"],
    enabled: canView,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email, is_active").order("full_name");
      return (data ?? []) as Profile[];
    },
  });

  const nameById = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name || p.email || "—"])), [profiles]);

  // Month-scoped: one-off expenses dated in this month + recurring expenses whose window covers this month.
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", month],
    enabled: canView,
    queryFn: async () => {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      const endInclusive = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("expenses")
        .select("*")
        .or(
          `and(recurring.eq.false,expense_date.gte.${start},expense_date.lt.${end}),` +
          `and(recurring.eq.true,expense_date.lte.${endInclusive})`
        )
        .order("expense_date", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Expense[];
      return rows.filter((e) => !e.recurring || recurringActiveInMonth(e, month));
    },
  });

  // Pending reimbursements — cross-month, all pending items where an employee paid.
  const { data: pendingReimbursements = [] } = useQuery({
    queryKey: ["expenses-pending-reimb"],
    enabled: canView,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("expenses")
        .select("*")
        .not("paid_by", "is", null)
        .eq("reimbursement_status", "pending")
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["expenses-projects"],
    enabled: canView,
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, code, name, status").order("name");
      return (data ?? []) as Project[];
    },
  });

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (catFilter !== "all" && e.category !== catFilter) return false;
      if (scopeFilter !== "all" && e.scope !== scopeFilter) return false;
      if (recurringOnly && !e.recurring) return false;
      return true;
    });
  }, [expenses, catFilter, scopeFilter, recurringOnly]);

  const monthlyTotal = useMemo(() => filtered.reduce((s, e) => s + monthlyEquivalent(e), 0), [filtered]);

  async function deleteExpense(e: Expense) {
    if (!confirm(`Delete "${e.title}"? This cannot be undone.`)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("expenses").delete().eq("id", e.id);
    if (error) return toast.error(error.message);
    if (e.proof_path) {
      await supabase.storage.from("expense-proofs").remove([e.proof_path]).catch(() => undefined);
    }
    toast.success("Expense deleted");
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["expenses-pending-reimb"] });
    qc.invalidateQueries({ queryKey: ["pb-expenses"] });
  }

  async function toggleReimbursement(e: Expense) {
    const next: ReimbursementStatus = e.reimbursement_status === "paid" ? "pending" : "paid";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("expenses").update({ reimbursement_status: next }).eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success(next === "paid" ? "Marked reimbursed" : "Marked pending");
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["expenses-pending-reimb"] });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><IndianRupee className="h-4 w-4" /> Expenses — {monthKeyOf(month + "-01")}</CardTitle>
            <CardDescription>Admin-only. Non-salary spend tracked toward project burn. Recurring items auto-amortize as monthly-equivalent.</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Label htmlFor="exp-month" className="text-xs text-muted-foreground">Month</Label>
            <Input id="exp-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-48 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={scopeFilter} onValueChange={setScopeFilter}>
              <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scopes</SelectItem>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="company">Company-wide</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant={recurringOnly ? "default" : "outline"} onClick={() => setRecurringOnly((v) => !v)}>
              <Repeat className="h-3.5 w-3.5 mr-1" /> Recurring
            </Button>
            <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add expense
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 text-sm text-muted-foreground">
            {filtered.length} entr{filtered.length === 1 ? "y" : "ies"} · Monthly-equivalent total <span className="font-semibold text-foreground">{inr(monthlyTotal)}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No expenses match the current filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Paid by</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Proof</TableHead>
                  <TableHead className="text-center">Tags</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => {
                  const proj = e.project_id ? projectById.get(e.project_id) : null;
                  const monthly = monthlyEquivalent(e);
                  const isReimb = !!e.paid_by;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(e.expense_date), "d MMM")}</TableCell>
                      <TableCell>
                        <div className="font-medium">{e.title}</div>
                        {e.description && <div className="text-xs text-muted-foreground line-clamp-1">{e.description}</div>}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{catLabel(e.category)}</Badge></TableCell>
                      <TableCell className="capitalize text-xs">{e.scope === "company" ? "Company-wide" : e.scope}</TableCell>
                      <TableCell className="text-xs">
                        {e.scope === "project" && proj ? <span><span className="font-mono text-muted-foreground mr-1">{proj.code}</span>{proj.name}</span> : null}
                        {e.scope === "department" ? e.department : null}
                        {e.scope === "company" ? <span className="text-muted-foreground">All active projects</span> : null}
                      </TableCell>
                      <TableCell className="text-xs">{e.paid_by ? nameById.get(e.paid_by) ?? "—" : <span className="text-muted-foreground">Company</span>}</TableCell>
                      <TableCell className="text-xs">{methodLabel(e.payment_method)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {inr(Number(e.amount_inr))}
                        {e.recurring && (
                          <div className="text-[10px] text-muted-foreground">≈ {inr(monthly)}/mo</div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {e.proof_path ? <ProofLink path={e.proof_path} /> : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-center space-x-1">
                        {e.recurring && (
                          <Badge variant="outline" className="text-[10px]"><Repeat className="h-3 w-3 mr-1" />{freqLabel(e.recurring_frequency)}</Badge>
                        )}
                        {isReimb && (
                          <button
                            type="button"
                            onClick={() => toggleReimbursement(e)}
                            title="Click to toggle reimbursement status"
                            className="inline-flex"
                          >
                            <Badge variant={e.reimbursement_status === "paid" ? "default" : "secondary"} className="text-[10px] cursor-pointer">
                              {e.reimbursement_status === "paid" ? "Paid" : "Pending"}
                            </Badge>
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setDialog({ mode: "duplicate", expense: e })} title="Duplicate">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDialog({ mode: "edit", expense: e })} title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteExpense(e)} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Pending reimbursements</CardTitle>
          <CardDescription>
            Employees still owed money for expenses they fronted. Informational — not merged into salary payout. Flip Pending → Paid once you have reimbursed them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingReimbursements.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Nothing pending. Everyone's square. 🎉</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Expense</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingReimbursements.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.paid_by ? nameById.get(e.paid_by) ?? "—" : "—"}</TableCell>
                    <TableCell>{e.title}</TableCell>
                    <TableCell className="text-xs">{format(new Date(e.expense_date), "d MMM yyyy")}</TableCell>
                    <TableCell className="text-xs">{methodLabel(e.payment_method)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{inr(Number(e.amount_inr))}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => toggleReimbursement(e)}>Mark paid</Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={4} className="text-right font-medium">Total owed</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {inr(pendingReimbursements.reduce((s, e) => s + Number(e.amount_inr || 0), 0))}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialog && (
        <ExpenseDialog
          mode={dialog.mode}
          source={dialog.expense}
          projects={projects}
          profiles={profiles}
          onClose={() => setDialog(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["expenses"] });
            qc.invalidateQueries({ queryKey: ["expenses-pending-reimb"] });
            qc.invalidateQueries({ queryKey: ["pb-expenses"] });
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function ProofLink({ path }: { path: string }) {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.storage.from("expense-proofs").createSignedUrl(path, 300).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setHref(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [path]);
  if (!href) return <Paperclip className="h-3.5 w-3.5 inline text-muted-foreground" />;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
      <Paperclip className="h-3.5 w-3.5" />open
    </a>
  );
}

function ExpenseDialog({
  mode,
  source,
  projects,
  profiles,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit" | "duplicate";
  source?: Expense;
  projects: Project[];
  profiles: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: me } = useCurrentUser();
  const isEdit = mode === "edit";
  const seed = source && mode !== "create" ? source : null;
  const today = new Date().toISOString().slice(0, 10);

  const [title, setTitle] = useState(seed?.title ?? "");
  const [description, setDescription] = useState(seed?.description ?? "");
  const [amount, setAmount] = useState(seed ? String(seed.amount_inr) : "");
  const [date, setDate] = useState(isEdit && seed ? seed.expense_date : today);
  const [category, setCategory] = useState<ExpenseCategory>(seed?.category ?? "software_subscriptions");
  const [scope, setScope] = useState<ExpenseScope>(seed?.scope ?? "project");
  const [projectId, setProjectId] = useState<string>(seed?.project_id ?? "");
  const [department, setDepartment] = useState<string>(seed?.department ?? "");
  const [paidBy, setPaidBy] = useState<string>(seed?.paid_by ?? "company");
  const [paymentMethod, setPaymentMethod] = useState<string>(seed?.payment_method ?? "upi");
  const [reimbStatus, setReimbStatus] = useState<ReimbursementStatus>(seed?.reimbursement_status ?? "pending");
  const [recurring, setRecurring] = useState<boolean>(seed?.recurring ?? false);
  const [frequency, setFrequency] = useState<RecurringFrequency>(seed?.recurring_frequency ?? "monthly");
  const [endDate, setEndDate] = useState<string>(seed?.recurrence_end_date ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [keepProof, setKeepProof] = useState<boolean>(!!seed?.proof_path);
  const [busy, setBusy] = useState(false);

  const activeProjects = useMemo(() => projects.filter((p) => p.status === "active" || (isEdit && p.id === projectId)), [projects, isEdit, projectId]);
  const activeEmployees = useMemo(() => profiles.filter((p) => p.is_active !== false), [profiles]);

  async function save() {
    if (!me) return;
    if (!title.trim()) return toast.error("Title is required");
    if (!amount || Number(amount) <= 0) return toast.error("Amount must be greater than zero");
    if (scope === "project" && !projectId) return toast.error("Pick a project");
    if (scope === "department" && !department) return toast.error("Pick a department");
    if (recurring && endDate && endDate < date) return toast.error("End date must be after the start date");
    setBusy(true);
    try {
      let proofPath: string | null = isEdit && keepProof ? (seed?.proof_path ?? null) : null;
      if (file) {
        const safe = file.name.replace(/\s+/g, "_");
        const path = `${me.realId}/${Date.now()}-${safe}`;
        const up = await supabase.storage.from("expense-proofs").upload(path, file, { upsert: true });
        if (up.error) throw up.error;
        proofPath = path;
      }
      const paidByValue = paidBy === "company" ? null : paidBy;
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        amount_inr: Number(amount),
        expense_date: date,
        category,
        scope,
        project_id: scope === "project" ? projectId : null,
        department: scope === "department" ? department : null,
        recurring,
        recurring_frequency: recurring ? frequency : null,
        recurrence_end_date: recurring && endDate ? endDate : null,
        paid_by: paidByValue,
        payment_method: paymentMethod,
        reimbursement_status: paidByValue ? reimbStatus : "na",
        proof_path: proofPath,
      };
      if (isEdit && seed) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("expenses").update(payload).eq("id", seed.id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("expenses").insert({ ...payload, created_by: me.realId });
        if (error) throw error;
      }
      toast.success(isEdit ? "Expense updated" : mode === "duplicate" ? "Expense duplicated" : "Expense added");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save expense");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit expense" : mode === "duplicate" ? "Duplicate expense" : "Add expense"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Zoho CRM · July" />
          </div>
          <div className="space-y-1">
            <Label>Description (optional)</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Amount (INR)</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Paid by</Label>
              <Select value={paidBy} onValueChange={setPaidBy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company</SelectItem>
                  {activeEmployees.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email ?? "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {paidBy !== "company" && (
            <div className="space-y-1">
              <Label>Reimbursement status</Label>
              <Select value={reimbStatus} onValueChange={(v) => setReimbStatus(v as ReimbursementStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending — still owed</SelectItem>
                  <SelectItem value="paid">Paid — reimbursed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ExpenseScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Project — 100% counts toward one project</SelectItem>
                <SelectItem value="department">Department — split across active projects with members in that dept</SelectItem>
                <SelectItem value="company">Company-wide — split across every active project</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === "project" && (
            <div className="space-y-1">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Pick a project…" /></SelectTrigger>
                <SelectContent>
                  {activeProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-mono text-xs mr-2">{p.code}</span>{p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {scope === "department" && (
            <div className="space-y-1">
              <Label>Department</Label>
              <DepartmentSelect value={department} onChange={setDepartment} allowClear={false} />
            </div>
          )}
          <div className="space-y-1">
            <Label>Proof (optional)</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setKeepProof(false); }} />
            {isEdit && seed?.proof_path && !file && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={keepProof} onChange={(e) => setKeepProof(e.target.checked)} /> Keep existing proof file
              </label>
            )}
          </div>
          <div className="space-y-2 rounded border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
              <span className="inline-flex items-center gap-1"><Repeat className="h-3.5 w-3.5" /> Recurring — auto-amortize across months</span>
            </label>
            {recurring && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">Frequency</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurringFrequency)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">End date (optional)</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
                {amount && Number(amount) > 0 && (
                  <div className="col-span-2 text-xs text-muted-foreground">
                    Monthly equivalent added to project burn: <span className="font-medium text-foreground">{inr(monthlyEquivalent({ recurring: true, recurring_frequency: frequency, amount_inr: Number(amount) }))}</span>{endDate ? ` · until ${endDate}` : " · ongoing"}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : isEdit ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
