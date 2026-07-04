import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyOnboarding,
  saveMyOnboarding,
  recordMyDocument,
  completeMyOnboarding,
  type OnboardingDocType,
} from "@/lib/onboarding.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, Upload, Loader2, ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/complete-onboarding")({
  component: CompleteOnboardingPage,
});

type DocSpec = { key: OnboardingDocType; label: string; required: boolean; accept: string };

const DOCS: DocSpec[] = [
  { key: "profile_picture", label: "Profile picture", required: true, accept: "image/*" },
  { key: "offer_letter", label: "Signed offer letter", required: true, accept: ".pdf,image/*" },
  { key: "aadhar", label: "Aadhar card", required: true, accept: ".pdf,image/*" },
  { key: "pan", label: "PAN card", required: true, accept: ".pdf,image/*" },
  { key: "cancelled_cheque", label: "Cancelled cheque", required: true, accept: ".pdf,image/*" },
  { key: "marksheet_10", label: "10th marksheet", required: true, accept: ".pdf,image/*" },
  { key: "marksheet_12", label: "12th marksheet", required: true, accept: ".pdf,image/*" },
  { key: "graduation", label: "Graduation certificate", required: true, accept: ".pdf,image/*" },
  { key: "masters", label: "Master's certificate (optional)", required: false, accept: ".pdf,image/*" },
  { key: "resume", label: "Updated resume", required: true, accept: ".pdf,.doc,.docx" },
];

function CompleteOnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const getOnboarding = useServerFn(getMyOnboarding);
  const saveOnboarding = useServerFn(saveMyOnboarding);
  const recordDoc = useServerFn(recordMyDocument);
  const finalize = useServerFn(completeMyOnboarding);

  const { data, isLoading } = useQuery({
    queryKey: ["my-onboarding"],
    queryFn: () => getOnboarding(),
  });

  // Personal
  const [fullName, setFullName] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [dob, setDob] = useState("");
  const [anniversary, setAnniversary] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [github, setGithub] = useState("");
  // Work
  const [department, setDepartment] = useState("");
  const [dayStart, setDayStart] = useState("");
  const [standup, setStandup] = useState("");
  // Bank
  const [holder, setHolder] = useState("");
  const [account, setAccount] = useState("");
  const [branch, setBranch] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [pan, setPan] = useState("");

  const [uploading, setUploading] = useState<OnboardingDocType | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!data) return;
    const p = (data.profile ?? {}) as Record<string, string | null>;
    setFullName(p.full_name ?? "");
    setPersonalEmail(p.personal_email ?? "");
    setPhone(p.phone ?? "");
    setAddress(p.permanent_address ?? "");
    setDob(p.date_of_birth ?? "");
    setAnniversary(p.marriage_anniversary ?? "");
    setLinkedin(p.linkedin_url ?? "");
    setGithub(p.github_url ?? "");
    setDepartment(p.department ?? "");
    setDayStart(p.day_start_time ?? "");
    setStandup(p.standup_time ?? "");
    const b = (data.bank ?? {}) as Record<string, string | null>;
    setHolder(b.account_holder_name ?? "");
    setAccount(b.account_number ?? "");
    setBranch(b.bank_branch ?? "");
    setIfsc(b.ifsc_code ?? "");
    setPan(b.pan_number ?? "");
  }, [data]);

  const uploaded = new Set((data?.documents ?? []).map((d) => d.doc_type));

  async function saveDraft() {
    setSaving(true);
    try {
      await saveOnboarding({ data: {
        profile: {
          full_name: fullName.trim() || null,
          personal_email: personalEmail.trim() || null,
          phone: phone.trim() || null,
          permanent_address: address.trim() || null,
          date_of_birth: dob || null,
          marriage_anniversary: anniversary || null,
          linkedin_url: linkedin.trim() || null,
          github_url: github.trim() || null,
          department: department.trim() || null,
          day_start_time: dayStart || null,
          standup_time: standup || null,
        },
        bank: {
          account_holder_name: holder.trim(),
          account_number: account.trim(),
          bank_branch: branch.trim(),
          ifsc_code: ifsc.trim().toUpperCase(),
          pan_number: pan.trim().toUpperCase(),
        },
      } });
      toast.success("Progress saved");
      qc.invalidateQueries({ queryKey: ["my-onboarding"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function uploadDoc(spec: DocSpec, file: File) {
    if (file.size > 10 * 1024 * 1024) { toast.error("File must be under 10 MB"); return; }
    setUploading(spec.key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `${user.id}/${spec.key}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("employee-documents")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) throw new Error(upErr.message);
      await recordDoc({ data: { doc_type: spec.key, storage_path: path } });
      toast.success(`${spec.label} uploaded`);
      qc.invalidateQueries({ queryKey: ["my-onboarding"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      // Save first, then attempt to complete
      await saveDraft();
      const res = await finalize();
      if (!res.ok) {
        toast.error(`Please complete: ${res.missing.slice(0, 3).join(", ")}${res.missing.length > 3 ? "…" : ""}`);
        return;
      }
      toast.success("Onboarding complete — welcome aboard!");
      qc.invalidateQueries({ queryKey: ["current-user"] });
      router.navigate({ to: "/dashboard", replace: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-primary" /> Complete your onboarding
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Fill in your details and upload the required documents. Access to the tool unlocks once everything is submitted.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle className="font-display text-lg">Personal details</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label="Full name *"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
          <Field label="Official email"><Input value={data?.profile?.email ?? ""} readOnly disabled /></Field>
          <Field label="Personal email *"><Input type="email" value={personalEmail} onChange={(e) => setPersonalEmail(e.target.value)} /></Field>
          <Field label="Phone number *"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" /></Field>
          <Field label="Date of birth *"><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
          <Field label="Marriage anniversary"><Input type="date" value={anniversary} onChange={(e) => setAnniversary(e.target.value)} /></Field>
          <Field label="LinkedIn profile *" className="md:col-span-2"><Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/…" /></Field>
          <Field label="GitHub / GitLab *" className="md:col-span-2"><Input value={github} onChange={(e) => setGithub(e.target.value)} placeholder="https://github.com/…" /></Field>
          <Field label="Permanent address *" className="md:col-span-2"><Textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display text-lg">Work preferences</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label="Job department *"><Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Engineering, Design, …" /></Field>
          <Field label="Joining date"><Input type="date" value={data?.profile?.joined_on ?? ""} readOnly disabled /></Field>
          <Field label="When do you start your day? *"><Input type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} /></Field>
          <Field label="Preferred standup time *"><Input type="time" value={standup} onChange={(e) => setStandup(e.target.value)} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display text-lg">Bank details</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label="Account holder name *" className="md:col-span-2"><Input value={holder} onChange={(e) => setHolder(e.target.value)} /></Field>
          <Field label="Account number *"><Input value={account} onChange={(e) => setAccount(e.target.value)} /></Field>
          <Field label="Bank branch *"><Input value={branch} onChange={(e) => setBranch(e.target.value)} /></Field>
          <Field label="IFSC code *"><Input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="ABCD0123456" maxLength={11} /></Field>
          <Field label="PAN card number *"><Input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Documents</CardTitle>
          <CardDescription>Upload each file (PDF or image, max 10 MB). You can replace a file by re-uploading it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {DOCS.map((doc) => {
            const isUp = uploaded.has(doc.key);
            const isBusy = uploading === doc.key;
            return (
              <div key={doc.key} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  {isUp ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
                  <span>{doc.label}</span>
                  {!doc.required && <Badge variant="outline" className="text-[10px]">Optional</Badge>}
                  {isUp && <Badge variant="outline" className="text-[10px] text-green-600 border-green-600/40">Uploaded</Badge>}
                </div>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept={doc.accept}
                    className="hidden"
                    disabled={isBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadDoc(doc, f);
                      e.currentTarget.value = "";
                    }}
                  />
                  <Button asChild size="sm" variant="outline" disabled={isBusy}>
                    <span>{isBusy ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Uploading…</> : isUp ? "Replace" : "Upload"}</span>
                  </Button>
                </label>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2 pb-8">
        <Button variant="outline" onClick={saveDraft} disabled={saving || submitting}>
          {saving ? "Saving…" : "Save progress"}
        </Button>
        <Button className="gradient-primary" onClick={submit} disabled={submitting}>
          {submitting ? "Submitting…" : "Complete onboarding"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
