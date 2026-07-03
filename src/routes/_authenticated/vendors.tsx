import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Handshake, Plus, Trash2, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/vendors")({
  component: VendorsPage,
});

type Vendor = { id: string; name: string; email: string | null; phone: string | null; notes: string | null };
type Payment = { id: string; vendor_id: string; project_id: string | null; amount: number; currency: string; payment_date: string; status: "pending" | "paid"; description: string | null };

function VendorsPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  if (me && !me.isSuperAdmin) throw redirect({ to: "/dashboard" });

  const [openVendor, setOpenVendor] = useState<Vendor | "new" | null>(null);
  const [openPay, setOpenPay] = useState<Payment | "new" | null>(null);
  const [filterVendor, setFilterVendor] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");

  const { data: vendors } = useQuery({
    queryKey: ["vendors"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => (await supabase.from("vendors").select("*").order("name")).data as Vendor[] ?? [],
  });

  const { data: projects } = useQuery({
    queryKey: ["projects-list"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => (await supabase.from("projects").select("id, code, name").order("code")).data ?? [],
  });

  const { data: payments } = useQuery({
    queryKey: ["vendor-payments"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => (await supabase.from("vendor_payments").select("*").order("payment_date", { ascending: false })).data as Payment[] ?? [],
  });

  const filtered = useMemo(() => (payments ?? []).filter((p) =>
    (filterVendor === "all" || p.vendor_id === filterVendor) &&
    (filterProject === "all" || p.project_id === filterProject)
  ), [payments, filterVendor, filterProject]);

  const vName = (id: string) => vendors?.find((v) => v.id === id)?.name ?? "—";
  const pName = (id: string | null) => id ? (projects?.find((p) => p.id === id)?.code ?? "—") : "—";

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const totals = (payments ?? []).reduce(
    (acc, p) => {
      if (p.status === "pending") acc.pending += Number(p.amount);
      if (p.status === "paid" && p.payment_date.startsWith(monthKey)) acc.paidMonth += Number(p.amount);
      return acc;
    },
    { pending: 0, paidMonth: 0 },
  );

  async function togglePaid(p: Payment) {
    const next = p.status === "paid" ? "pending" : "paid";
    const { error } = await supabase.from("vendor_payments").update({ status: next }).eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["vendor-payments"] });
  }
  async function removePayment(p: Payment) {
    if (!confirm("Delete this payment entry?")) return;
    const { error } = await supabase.from("vendor_payments").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["vendor-payments"] });
  }
  async function removeVendor(v: Vendor) {
    if (!confirm(`Delete vendor "${v.name}"? All their payment entries will also be removed.`)) return;
    const { error } = await supabase.from("vendors").delete().eq("id", v.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Handshake className="h-6 w-6 text-primary" /> Vendors</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage external vendors and track their payments per project.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOpenVendor("new")}><Plus className="h-4 w-4 mr-1" /> Vendor</Button>
          <Button className="gradient-primary" onClick={() => setOpenPay("new")}><Wallet className="h-4 w-4 mr-1" /> Log payment</Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader className="pb-2"><CardDescription>Pending payments</CardDescription><CardTitle className="font-display text-2xl">₹ {totals.pending.toLocaleString("en-IN")}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Paid this month</CardDescription><CardTitle className="font-display text-2xl">₹ {totals.paidMonth.toLocaleString("en-IN")}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="font-display">Vendors ({vendors?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2">
            {vendors?.map((v) => (
              <div key={v.id} className="rounded-lg border border-border/60 p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{v.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{v.email ?? "—"} · {v.phone ?? "—"}</div>
                  {v.notes && <div className="text-xs text-muted-foreground mt-1">{v.notes}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => setOpenVendor(v)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => removeVendor(v)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            {(vendors?.length ?? 0) === 0 && <div className="text-sm text-muted-foreground">No vendors yet.</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="font-display">Payments</CardTitle>
            <CardDescription>{filtered.length} entr{filtered.length === 1 ? "y" : "ies"}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={filterVendor} onValueChange={setFilterVendor}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Vendor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vendors</SelectItem>
                {vendors?.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects?.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} · {p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filtered.map((p) => (
              <div key={p.id} className="rounded-lg border border-border/60 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{vName(p.vendor_id)}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-mono text-xs text-muted-foreground">{pName(p.project_id)}</span>
                    <Badge variant={p.status === "paid" ? "default" : "outline"} className="capitalize ml-1">{p.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{format(new Date(p.payment_date), "MMM d, yyyy")}{p.description ? ` · ${p.description}` : ""}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{p.currency} {Number(p.amount).toLocaleString("en-IN")}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => togglePaid(p)}>{p.status === "paid" ? "Mark pending" : "Mark paid"}</Button>
                  <Button size="icon" variant="ghost" onClick={() => setOpenPay(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => removePayment(p)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="text-sm text-muted-foreground">No payments match.</div>}
          </div>
        </CardContent>
      </Card>

      <VendorDialog open={openVendor} onClose={() => setOpenVendor(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["vendors"] })} />
      <PaymentDialog open={openPay} onClose={() => setOpenPay(null)} vendors={vendors ?? []} projects={projects ?? []} meId={me?.realId ?? null} onSaved={() => qc.invalidateQueries({ queryKey: ["vendor-payments"] })} />
    </div>
  );
}

function VendorDialog({ open, onClose, onSaved }: { open: Vendor | "new" | null; onClose: () => void; onSaved: () => void }) {
  const isNew = open === "new";
  const v = open && open !== "new" ? open : null;
  const [name, setName] = useState(v?.name ?? "");
  const [email, setEmail] = useState(v?.email ?? "");
  const [phone, setPhone] = useState(v?.phone ?? "");
  const [notes, setNotes] = useState(v?.notes ?? "");

  // reset when opening
  useMemo(() => {
    setName(v?.name ?? "");
    setEmail(v?.email ?? "");
    setPhone(v?.phone ?? "");
    setNotes(v?.notes ?? "");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!name.trim()) return toast.error("Name required");
    const payload = { name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, notes: notes.trim() || null };
    const { error } = isNew
      ? await supabase.from("vendors").insert(payload)
      : await supabase.from("vendors").update(payload).eq("id", v!.id);
    if (error) return toast.error(error.message);
    toast.success(isNew ? "Vendor added" : "Vendor updated");
    onSaved();
    onClose();
  }

  return (
    <Dialog open={!!open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">{isNew ? "New vendor" : "Edit vendor"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={save} className="gradient-primary">{isNew ? "Add vendor" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ open, onClose, vendors, projects, meId, onSaved }: { open: Payment | "new" | null; onClose: () => void; vendors: Vendor[]; projects: { id: string; code: string; name: string }[]; meId: string | null; onSaved: () => void }) {
  const isNew = open === "new";
  const p = open && open !== "new" ? open : null;
  const [vendorId, setVendorId] = useState(p?.vendor_id ?? "");
  const [projectId, setProjectId] = useState<string>(p?.project_id ?? "none");
  const [amount, setAmount] = useState<string>(p?.amount ? String(p.amount) : "");
  const [currency, setCurrency] = useState(p?.currency ?? "INR");
  const [date, setDate] = useState(p?.payment_date ?? format(new Date(), "yyyy-MM-dd"));
  const [status, setStatus] = useState<"pending" | "paid">(p?.status ?? "pending");
  const [desc, setDesc] = useState(p?.description ?? "");

  useMemo(() => {
    setVendorId(p?.vendor_id ?? "");
    setProjectId(p?.project_id ?? "none");
    setAmount(p?.amount ? String(p.amount) : "");
    setCurrency(p?.currency ?? "INR");
    setDate(p?.payment_date ?? format(new Date(), "yyyy-MM-dd"));
    setStatus(p?.status ?? "pending");
    setDesc(p?.description ?? "");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!vendorId) return toast.error("Vendor required");
    const amt = Number(amount);
    if (!(amt > 0)) return toast.error("Amount must be greater than 0");
    const payload = {
      vendor_id: vendorId,
      project_id: projectId === "none" ? null : projectId,
      amount: amt,
      currency,
      payment_date: date,
      status,
      description: desc.trim() || null,
      ...(isNew ? { created_by: meId } : {}),
    };
    const { error } = isNew
      ? await supabase.from("vendor_payments").insert(payload)
      : await supabase.from("vendor_payments").update(payload).eq("id", p!.id);
    if (error) return toast.error(error.message);
    toast.success(isNew ? "Payment logged" : "Payment updated");
    onSaved();
    onClose();
  }

  return (
    <Dialog open={!!open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">{isNew ? "Log payment" : "Edit payment"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Vendor</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Project (optional)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {projects.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.code} · {pr.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 col-span-2"><Label>Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1"><Label>Currency</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1"><Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "pending" | "paid")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Description</Label><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={save} className="gradient-primary">{isNew ? "Log payment" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
