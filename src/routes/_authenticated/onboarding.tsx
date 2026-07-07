import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { createTeamUser, updateEmployeeProfile } from "@/lib/admin-users.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";
import { UserPlus, Search, Pencil, Copy, Check } from "lucide-react";
import { DepartmentSelect } from "@/components/department-select";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/onboarding")({
  beforeLoad: () => { throw redirect({ to: "/hr-admin", search: { tab: "onboarding" } }); },
});

type EmploymentType = "full_time" | "intern" | "contract" | "consultant";
type Role = "employee" | "project_manager" | "admin" | "hr_admin";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  date_of_birth: string | null;
  joined_on: string | null;
  phone: string | null;
  employment_type: string | null;
  notes: string | null;
  created_at: string;
};

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  full_time: "Full-time",
  intern: "Intern",
  contract: "Contract",
  consultant: "Consultant",
};

export function OnboardingPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const createUserFn = useServerFn(createTeamUser);
  const updateProfileFn = useServerFn(updateEmployeeProfile);

  if (me && !me.isSuperAdmin && !me.isHrAdmin) throw redirect({ to: "/dashboard" });

  const canSetSalary = !!(me?.isSuperAdmin || me?.isHrAdmin);
  const canPromote = !!me?.isSuperAdmin;

  // Form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [joinedOn, setJoinedOn] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [employmentType, setEmploymentType] = useState<EmploymentType>("full_time");
  const [salary, setSalary] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ProfileRow | null>(null);

  const { data: recent } = useQuery({
    queryKey: ["onboarding-recent"],
    enabled: !!me && (me.isSuperAdmin || me.isHrAdmin),
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, department, date_of_birth, joined_on, phone, employment_type, notes, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as ProfileRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recent ?? [];
    return (recent ?? []).filter((r) =>
      (r.full_name ?? "").toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q) ||
      (r.department ?? "").toLowerCase().includes(q),
    );
  }, [recent, search]);

  function resetForm() {
    setFullName(""); setEmail(""); setPhone(""); setDob("");
    setDepartment(""); setRole("employee");
    setJoinedOn(format(new Date(), "yyyy-MM-dd"));
    setEmploymentType("full_time"); setSalary(""); setNotes("");
  }

  async function submit() {
    const em = email.trim().toLowerCase();
    if (!em || !em.includes("@")) return toast.error("Valid email required");
    if (!/@colladome\.(com|in)$/i.test(em)) return toast.error("Email must be @colladome.com or @colladome.in");
    if (!fullName.trim()) return toast.error("Full name required");
    setSubmitting(true);
    try {
      const res = await createUserFn({ data: {
        email: em,
        full_name: fullName.trim(),
        role,
        default_monthly_salary: canSetSalary && salary.trim() ? Number(salary) : null,
        department: department.trim() || null,
        date_of_birth: dob || null,
        joined_on: joinedOn || null,
        phone: phone.trim() || null,
        employment_type: employmentType,
        notes: notes.trim() || null,
      } });
      setLastCreated({ email: res.email, password: res.temporary_password });
      toast.success(`Onboarded ${res.email}`);
      resetForm();
      qc.invalidateQueries({ queryKey: ["onboarding-recent"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to onboard");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCreds() {
    if (!lastCreated) return;
    await navigator.clipboard.writeText(`Email: ${lastCreated.email}\nTemporary password: ${lastCreated.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <UserPlus className="h-6 w-6 text-primary" /> Employee Onboarding
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Create a new team member account. Details you enter here flow into the Team Calendar (birthdays, anniversaries, department) and Team directory.
        </p>
      </header>

      {lastCreated && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display">Share these sign-in details</CardTitle>
            <CardDescription>The new member will be forced to set a new password on first sign-in.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <span><span className="text-muted-foreground">Email:</span> <code className="px-1 rounded bg-muted">{lastCreated.email}</code></span>
            <span><span className="text-muted-foreground">Temp password:</span> <code className="px-1 rounded bg-muted">{lastCreated.password}</code></span>
            <Button size="sm" variant="outline" onClick={copyCreds}>
              {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLastCreated(null)}>Dismiss</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Add employee</CardTitle>
          <CardDescription>Personal, work and (optionally) compensation details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Personal</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Full name *</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Akash Kumar" /></div>
              <div className="space-y-1"><Label>Email *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@colladome.com" /></div>
              <div className="space-y-1"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" /></div>
              <div className="space-y-1"><Label>Date of birth</Label><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Work</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Department</Label><DepartmentSelect value={department} onChange={setDepartment} /></div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="project_manager">Project Manager</SelectItem>
                    {canPromote && <SelectItem value="hr_admin">HR Admin</SelectItem>}
                    {canPromote && <SelectItem value="admin">Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Joined on</Label><Input type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} /></div>
              <div className="space-y-1">
                <Label>Employment type</Label>
                <Select value={employmentType} onValueChange={(v) => setEmploymentType(v as EmploymentType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(EMPLOYMENT_LABEL) as EmploymentType[]).map((k) => (
                      <SelectItem key={k} value={k}>{EMPLOYMENT_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {canSetSalary && (
            <section className="space-y-3">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Compensation</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1"><Label>Monthly salary (INR)</Label><Input inputMode="numeric" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="e.g. 40000" /></div>
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Notes</h3>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything HR should remember about this hire (referral, reporting manager, offer notes)…" />
          </section>

          <div className="flex items-center gap-2">
            <Button className="gradient-primary" onClick={submit} disabled={submitting}>
              {submitting ? "Onboarding…" : "Onboard employee"}
            </Button>
            <Button variant="ghost" onClick={resetForm} disabled={submitting}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display">Team directory</CardTitle>
            <CardDescription>Recently onboarded members — click any row to edit their details.</CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, dept" className="h-9 w-64 pl-7" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Email</th>
                  <th className="text-left px-3 py-2">Department</th>
                  <th className="text-left px-3 py-2">Joined</th>
                  <th className="text-left px-3 py-2">DOB</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No matches.</td></tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-border/40 hover:bg-muted/30 cursor-pointer" onClick={() => setEditing(r)}>
                    <td className="px-3 py-2 font-medium">{r.full_name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.email ?? "—"}</td>
                    <td className="px-3 py-2">{r.department ? <Badge variant="outline">{r.department}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2">{r.joined_on ? format(new Date(r.joined_on), "d MMM yyyy") : "—"}</td>
                    <td className="px-3 py-2">{r.date_of_birth ? format(new Date(r.date_of_birth), "d MMM") : "—"}</td>
                    <td className="px-3 py-2 text-right"><Pencil className="inline h-3.5 w-3.5 text-muted-foreground" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <EditProfileSheet
        row={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (!editing) return;
          try {
            await updateProfileFn({ data: { user_id: editing.id, ...patch } });
            toast.success("Profile updated");
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["onboarding-recent"] });
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to update");
          }
        }}
      />
    </div>
  );
}

function EditProfileSheet({ row, onClose, onSave }: {
  row: ProfileRow | null;
  onClose: () => void;
  onSave: (patch: {
    full_name?: string | null;
    department?: string | null;
    date_of_birth?: string | null;
    joined_on?: string | null;
    phone?: string | null;
    employment_type?: EmploymentType | null;
    notes?: string | null;
  }) => void | Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [dob, setDob] = useState("");
  const [joinedOn, setJoinedOn] = useState("");
  const [phone, setPhone] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType | "">("");
  const [notes, setNotes] = useState("");

  // Populate whenever the row changes
  useMemo(() => {
    if (!row) return;
    setFullName(row.full_name ?? "");
    setDepartment(row.department ?? "");
    setDob(row.date_of_birth ?? "");
    setJoinedOn(row.joined_on ?? "");
    setPhone(row.phone ?? "");
    setEmploymentType((row.employment_type as EmploymentType | null) ?? "");
    setNotes(row.notes ?? "");
  }, [row]);

  return (
    <Sheet open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">Edit member</SheetTitle>
          <SheetDescription>{row?.email}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <div className="space-y-1"><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1"><Label>Department</Label><DepartmentSelect value={department} onChange={setDepartment} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Date of birth</Label><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></div>
            <div className="space-y-1"><Label>Joined on</Label><Input type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Employment type</Label>
            <Select value={employmentType || undefined} onValueChange={(v) => setEmploymentType(v as EmploymentType)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {(Object.keys(EMPLOYMENT_LABEL) as EmploymentType[]).map((k) => (
                  <SelectItem key={k} value={k}>{EMPLOYMENT_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              className="gradient-primary"
              onClick={() => onSave({
                full_name: fullName.trim() || null,
                department: department.trim() || null,
                date_of_birth: dob || null,
                joined_on: joinedOn || null,
                phone: phone.trim() || null,
                employment_type: (employmentType || null) as EmploymentType | null,
                notes: notes.trim() || null,
              })}
            >Save</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
