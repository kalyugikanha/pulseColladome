import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, AlertTriangle, Settings2 } from "lucide-react";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Row 2 boilerplate — verbatim from the bank's template. Do not edit.
const ROW2_BOILERPLATE: string[] = [
  "Enter beneficiary name.\nMANDATORY",
  "Enter beneficiary account number. \nThis can be IDFC FIRST Bank account or other Bank account.\nMANDATORY",
  "Enter beneficiary bank IFSC code. Required only for Inter bank (NEFT/RTGS) payment.",
  "Enter payment type:\nIFT - Within Bank payment\nNEFT - Inter-Bank(NEFT) payment\nRTGS - Inter-Bank(RTGS) payment\nMANDATORY",
  "Enter debit account number. This should be IDFC FIRST Bank account only. User should have access to do transaction on this account",
  "Enter transaction value date. Should be today's date or future date.\nMANDATORY\nDD/MM/YYYY format",
  "Enter payment amount.\nMANDATORY",
  "Enter transaction currency. Should be INR only.\nMANDATORY",
  "Enter beneficiary email id\nOPTIONAL",
  "Enter remarks\nOPTIONAL",
  "Credit Advice:\nEnter Custom Info -1\nNote: Header label is editable in Row 1\nOPTIONAL",
  "Credit Advice:\nEnter Custom Info -2\nNote: Header label is editable in Row 1\nOPTIONAL",
  "Credit Advice:\nEnter Custom Info -3\nNote: Header label is editable in Row 1\nOPTIONAL",
  "Credit Advice:\nEnter Custom Info -4\nNote: Header label is editable in Row 1\nOPTIONAL",
  "Credit Advice:\nEnter Custom Info -5\nNote: Header label is editable in Row 1\nOPTIONAL",
];

const HEADERS = [
  "Beneficiary Name",
  "Beneficiary Account Number",
  "IFSC",
  "Transaction Type",
  "Debit Account Number",
  "Transaction Date",
  "Amount",
  "Currency",
  "Beneficiary Email ID",
  "Remarks",
  "Custom Header 1",
  "Custom Header 2",
  "Custom Header 3",
  "Custom Header 4",
  "Custom Header 5",
];

type Profile = { id: string; full_name: string | null; email: string | null; is_active: boolean | null; joined_on: string | null };
type Salary = { user_id: string; monthly_salary: number | null; hourly_rate: number | null; comp_type: "monthly" | "hourly"; effective_from: string };
type Bank = { user_id: string; account_number: string | null; ifsc_code: string | null };
type Settings = { debit_account_number: string; pay_date_offset_days: number };

// All calendar months strictly before the current calendar month, most recent first.
// Goes back ~5 years so historical exports remain possible.
function availableMonths(): string[] {
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth(); // 0-based
  const out: string[] = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date(cy, cm - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function fmtDDMMYYYY(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function SalaryBankExport() {
  const qc = useQueryClient();
  const months = useMemo(availableMonths, []);
  const [month, setMonth] = useState(months[0]); // most recent completed month
  const [generating, setGenerating] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);
  const [draftDebit, setDraftDebit] = useState("");
  const [draftOffset, setDraftOffset] = useState("10");

  const { data: settings } = useQuery({
    queryKey: ["payroll-settings"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("payroll_settings").select("debit_account_number, pay_date_offset_days").eq("id", "default").maybeSingle();
      return (data as Settings | null) ?? { debit_account_number: "78142495151", pay_date_offset_days: 10 };
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["salary-export-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email, is_active, joined_on").order("full_name");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const { data: salaries } = useQuery({
    queryKey: ["salary-export-salaries"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("salaries").select("user_id, monthly_salary, hourly_rate, comp_type, effective_from");
      return (data ?? []) as Salary[];
    },
  });

  const { data: banks } = useQuery({
    queryKey: ["salary-export-banks"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("employee_bank_details").select("user_id, account_number, ifsc_code");
      return (data ?? []) as Bank[];
    },
  });

  const { data: unpaidLeaves } = useQuery({
    queryKey: ["salary-export-unpaid", month],
    queryFn: async () => {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("leave_requests")
        .select("user_id, start_date, end_date, leave_type, status")
        .eq("leave_type", "unpaid")
        .eq("status", "approved")
        .lte("start_date", end)
        .gte("end_date", start);
      return (data ?? []) as Array<{ user_id: string; start_date: string; end_date: string }>;
    },
  });

  const { data: taskHours } = useQuery({
    queryKey: ["salary-export-approved-hours", month],
    queryFn: async () => {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      // Only approved days count toward hourly salary.
      const { data } = await supabase
        .from("attendance_logs")
        .select("user_id, tasks")
        .not("approved_at", "is", null)
        .gte("date", start)
        .lt("date", end);
      const out: Array<{ actor_id: string; hours: number }> = [];
      for (const row of (data ?? []) as Array<{ user_id: string; tasks: Array<{ hours?: number; approved_hours?: number }> | null }>) {
        let sum = 0;
        for (const t of row.tasks ?? []) sum += Number(t.approved_hours ?? t.hours) || 0;
        if (sum > 0) out.push({ actor_id: row.user_id, hours: sum });
      }
      return out;
    },
  });

  // Prepare rows
  const rows = useMemo(() => {
    if (!profiles || !salaries || !settings) return [] as Array<{ profile: Profile; amount: number; bank: Bank | null; missingBank: boolean }>;
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthStart = new Date(Date.UTC(y, m - 1, 1));
    const monthEnd = new Date(Date.UTC(y, m, 0));

    // Latest salary as of month end per user
    const latest = new Map<string, Salary>();
    for (const s of salaries) {
      if (new Date(s.effective_from) > monthEnd) continue;
      const prev = latest.get(s.user_id);
      if (!prev || new Date(s.effective_from) > new Date(prev.effective_from)) latest.set(s.user_id, s);
    }

    // Unpaid days per user
    const unpaid = new Map<string, number>();
    const DAY = 86400000;
    for (const lr of unpaidLeaves ?? []) {
      const s = Date.parse(lr.start_date);
      const e = Date.parse(lr.end_date);
      if (isNaN(s) || isNaN(e)) continue;
      const from = Math.max(s, monthStart.getTime());
      const to = Math.min(e, monthEnd.getTime());
      if (to < from) continue;
      const d = Math.round((to - from) / DAY) + 1;
      unpaid.set(lr.user_id, (unpaid.get(lr.user_id) ?? 0) + d);
    }

    // Hours per user for hourly comp (approved days only)
    const hoursByUser = new Map<string, number>();
    for (const r of taskHours ?? []) {
      const h = Number(r.hours) || 0;
      if (h > 0) hoursByUser.set(r.actor_id, (hoursByUser.get(r.actor_id) ?? 0) + h);
    }

    const bankByUser = new Map<string, Bank>();
    for (const b of banks ?? []) bankByUser.set(b.user_id, b);

    const out: Array<{ profile: Profile; amount: number; bank: Bank | null; missingBank: boolean }> = [];
    for (const p of profiles) {
      if (p.is_active === false) continue;
      const s = latest.get(p.id);
      if (!s) continue; // skip employees with no salary configured
      let amount = 0;
      if (s.comp_type === "hourly") {
        amount = Number(s.hourly_rate ?? 0) * (hoursByUser.get(p.id) ?? 0);
      } else {
        const eff = new Date(s.effective_from);
        const startDay = eff > monthStart ? eff.getUTCDate() : 1;
        const effectiveDays = daysInMonth - startDay + 1;
        const payableDays = Math.max(0, effectiveDays - (unpaid.get(p.id) ?? 0));
        amount = Number(s.monthly_salary ?? 0) * payableDays / daysInMonth;
      }
      if (amount <= 0) continue;
      const bank = bankByUser.get(p.id) ?? null;
      const missingBank = !bank || !bank.account_number?.trim() || !bank.ifsc_code?.trim();
      out.push({ profile: p, amount: Math.round(amount * 100) / 100, bank, missingBank });
    }
    out.sort((a, b) => (a.profile.full_name ?? "").localeCompare(b.profile.full_name ?? ""));
    return out;
  }, [profiles, salaries, banks, unpaidLeaves, taskHours, settings, month]);

  const missingBankRows = useMemo(() => rows.filter((r) => r.missingBank), [rows]);
  const totalAmount = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);

  const [y, mm] = month.split("-").map(Number);
  const transactionDate = useMemo(() => {
    const offset = settings?.pay_date_offset_days ?? 10;
    // month-end + offset (offset 10 for June → July 10)
    return new Date(y, mm - 1 + 1, offset); // first of next month base, day = offset
  }, [y, mm, settings]);

  async function download() {
    if (!settings) return;
    if (rows.length === 0) {
      toast.error("No salary rows to export for this month.");
      return;
    }
    setGenerating(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Salary Upload");
      ws.columns = HEADERS.map((h) => ({ header: h, width: 22 }));

      // Row 1 headers already set via columns; style them
      const header = ws.getRow(1);
      header.font = { bold: true };
      header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      header.height = 24;

      // Row 2 boilerplate — verbatim
      const boiler = ws.getRow(2);
      ROW2_BOILERPLATE.forEach((text, i) => { boiler.getCell(i + 1).value = text; });
      boiler.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      boiler.height = 90;
      boiler.font = { italic: true, size: 9 };

      // Data rows
      const txDate = fmtDDMMYYYY(transactionDate);
      rows.forEach((r, idx) => {
        const row = ws.getRow(3 + idx);
        row.getCell(1).value = r.profile.full_name ?? "";
        row.getCell(2).value = r.bank?.account_number ?? "";
        row.getCell(3).value = r.bank?.ifsc_code ?? "";
        row.getCell(4).value = "NEFT";
        row.getCell(5).value = settings.debit_account_number;
        row.getCell(6).value = txDate;
        row.getCell(7).value = r.amount;
        row.getCell(7).numFmt = "0.00";
        row.getCell(8).value = "INR";
        row.getCell(9).value = r.profile.email ?? "";
        row.getCell(10).value = "Salary";
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Salary_${MONTH_NAMES[mm - 1]}_${y}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} rows for ${MONTH_NAMES[mm - 1]} ${y}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setGenerating(false);
    }
  }

  async function saveSettings() {
    const debit = draftDebit.trim();
    const offset = parseInt(draftOffset, 10);
    if (!debit) return toast.error("Debit account is required");
    if (!Number.isFinite(offset) || offset < 1 || offset > 28) return toast.error("Pay date offset must be 1–28");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("payroll_settings").upsert({ id: "default", debit_account_number: debit, pay_date_offset_days: offset });
    if (error) return toast.error(error.message);
    toast.success("Payroll settings saved");
    setEditingSettings(false);
    qc.invalidateQueries({ queryKey: ["payroll-settings"] });
  }

  function openSettings() {
    setDraftDebit(settings?.debit_account_number ?? "78142495151");
    setDraftOffset(String(settings?.pay_date_offset_days ?? 10));
    setEditingSettings(true);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-primary" /> Bank NEFT upload</CardTitle>
            <CardDescription>
              Export the monthly payroll in IDFC FIRST's bulk-NEFT upload format.
              Only completed months are available — the current month unlocks on the 1st of next month.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={openSettings}>
            <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Payroll settings
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Payroll month</Label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[10rem]"
            >
              {months.map((mk) => {
                const [yy, mn] = mk.split("-").map(Number);
                return <option key={mk} value={mk}>{MONTH_NAMES[mn - 1]} {yy}</option>;
              })}
            </select>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>Debit account: <span className="font-mono">{settings?.debit_account_number ?? "…"}</span></div>
            <div>Transaction date: <span className="font-mono">{fmtDDMMYYYY(transactionDate)}</span></div>
            <div>{rows.length} rows · total ₹{totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="ml-auto">
            <Button className="gradient-primary" onClick={download} disabled={generating || rows.length === 0}>
              <Download className="h-4 w-4 mr-1.5" /> {generating ? "Preparing…" : "Download xlsx"}
            </Button>
          </div>
        </div>

        {missingBankRows.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 space-y-2">
            <div className="flex items-center gap-2 text-warning font-medium text-sm">
              <AlertTriangle className="h-4 w-4" />
              {missingBankRows.length} employee{missingBankRows.length === 1 ? "" : "s"} missing bank details
            </div>
            <p className="text-xs text-muted-foreground">
              These rows will still be included in the file but with blank account/IFSC. Add bank details from the
              Employee Directory (Edit → Bank details).
            </p>
            <div className="flex flex-wrap gap-1.5">
              {missingBankRows.map((r) => (
                <Badge key={r.profile.id} variant="outline" className="text-[11px]">
                  {r.profile.full_name ?? r.profile.email}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {editingSettings && (
          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="text-sm font-medium">Payroll settings</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Debit account number</Label>
                <Input value={draftDebit} onChange={(e) => setDraftDebit(e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pay date (day of next month)</Label>
                <Input value={draftOffset} onChange={(e) => setDraftOffset(e.target.value)} inputMode="numeric" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingSettings(false)}>Cancel</Button>
              <Button size="sm" className="gradient-primary" onClick={saveSettings}>Save</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
