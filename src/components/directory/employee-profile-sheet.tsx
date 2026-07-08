import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, ExternalLink, Upload, Pencil, X as XIcon, Save, ShieldCheck } from "lucide-react";
import {
  adminGetEmployeeFull,
  adminUpdateEmployeeProfile,
  adminUploadEmployeeDocument,
} from "@/lib/admin-employee.functions";
import { getEmployeeDocumentUrl, type OnboardingDocType } from "@/lib/onboarding.functions";

const DOC_LABELS: Record<OnboardingDocType, string> = {
  offer_letter: "Signed offer letter",
  aadhar: "Aadhar card",
  pan: "PAN card",
  cancelled_cheque: "Cancelled cheque",
  marksheet_10: "10th marksheet",
  marksheet_12: "12th marksheet",
  graduation: "Graduation certificate",
  masters: "Master's certificate",
  resume: "Resume",
  profile_picture: "Profile picture",
  follow_facebook: "Facebook — follow proof",
  follow_instagram: "Instagram — follow proof",
  follow_twitter: "X (Twitter) — follow proof",
  follow_linkedin: "LinkedIn page — follow proof",
  follow_youtube: "YouTube — subscribe proof",
  follow_pinterest: "Pinterest — follow proof",
  follow_whatsapp: "WhatsApp channel — join proof",
  review_google_jaipur: "Google review (Jaipur)",
  review_google_hyderabad: "Google review (Hyderabad)",
  review_glassdoor: "Glassdoor review",
  review_ambitionbox: "AmbitionBox review",
  linkedin_employment: "LinkedIn 'Works at Colladome' proof",
};

const DOC_GROUPS: { title: string; keys: OnboardingDocType[] }[] = [
  { title: "Identity & employment", keys: ["offer_letter", "aadhar", "pan", "cancelled_cheque", "resume", "profile_picture"] },
  { title: "Education", keys: ["marksheet_10", "marksheet_12", "graduation", "masters"] },
  { title: "Social follows", keys: ["follow_facebook", "follow_instagram", "follow_twitter", "follow_linkedin", "follow_youtube", "follow_pinterest", "follow_whatsapp"] },
  { title: "Reviews & LinkedIn", keys: ["review_google_jaipur", "review_google_hyderabad", "review_glassdoor", "review_ambitionbox", "linkedin_employment"] },
];

type ProfileForm = {
  full_name: string;
  personal_email: string;
  phone: string;
  permanent_address: string;
  date_of_birth: string;
  marriage_anniversary: string;
  hobbies: string;
  profile_picture_url: string;
  department: string;
  employment_type: string;
  joined_on: string;
  day_start_time: string;
  standup_time: string;
  linkedin_url: string;
  github_url: string;
  facebook_url: string;
  instagram_url: string;
  twitter_url: string;
  youtube_url: string;
  pinterest_url: string;
};

type BankForm = {
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_branch: string;
  pan_number: string;
};

const EMPTY_PROFILE: ProfileForm = {
  full_name: "", personal_email: "", phone: "", permanent_address: "",
  date_of_birth: "", marriage_anniversary: "", hobbies: "", profile_picture_url: "",
  department: "", employment_type: "", joined_on: "", day_start_time: "", standup_time: "",
  linkedin_url: "", github_url: "", facebook_url: "", instagram_url: "", twitter_url: "",
  youtube_url: "", pinterest_url: "",
};

const EMPTY_BANK: BankForm = {
  account_holder_name: "", account_number: "", ifsc_code: "", bank_branch: "", pan_number: "",
};

export function EmployeeProfileSheet({
  userId,
  open,
  onOpenChange,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetEmployeeFull);
  const updateFn = useServerFn(adminUpdateEmployeeProfile);
  const uploadFn = useServerFn(adminUploadEmployeeDocument);
  const getUrlFn = useServerFn(getEmployeeDocumentUrl);

  const [editMode, setEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm>(EMPTY_PROFILE);
  const [bankForm, setBankForm] = useState<BankForm>(EMPTY_BANK);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<OnboardingDocType | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-employee-full", userId],
    enabled: !!userId && open,
    queryFn: () => getFn({ data: { user_id: userId! } }),
  });

  useEffect(() => {
    if (!data?.profile) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = data.profile as any;
    setProfileForm({
      full_name: p.full_name ?? "",
      personal_email: p.personal_email ?? "",
      phone: p.phone ?? "",
      permanent_address: p.permanent_address ?? "",
      date_of_birth: p.date_of_birth ?? "",
      marriage_anniversary: p.marriage_anniversary ?? "",
      hobbies: p.hobbies ?? "",
      profile_picture_url: p.profile_picture_url ?? "",
      department: p.department ?? "",
      employment_type: p.employment_type ?? "",
      joined_on: p.joined_on ?? "",
      day_start_time: p.day_start_time ?? "",
      standup_time: p.standup_time ?? "",
      linkedin_url: p.linkedin_url ?? "",
      github_url: p.github_url ?? "",
      facebook_url: p.facebook_url ?? "",
      instagram_url: p.instagram_url ?? "",
      twitter_url: p.twitter_url ?? "",
      youtube_url: p.youtube_url ?? "",
      pinterest_url: p.pinterest_url ?? "",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = (data.bank as any) ?? {};
    setBankForm({
      account_holder_name: b.account_holder_name ?? "",
      account_number: b.account_number ?? "",
      ifsc_code: b.ifsc_code ?? "",
      bank_branch: b.bank_branch ?? "",
      pan_number: b.pan_number ?? "",
    });
  }, [data]);

  useEffect(() => {
    if (!open) setEditMode(false);
  }, [open]);

  const uploaded = useMemo(
    () => new Map((data?.documents ?? []).map((d) => [d.doc_type, d])),
    [data]
  );

  async function save() {
    if (!userId) return;
    setSaving(true);
    try {
      const profilePatch: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(profileForm)) {
        profilePatch[k] = v === "" ? null : v;
      }
      const bankPatch: Record<string, string> = {};
      for (const [k, v] of Object.entries(bankForm)) {
        if (v.trim() !== "") bankPatch[k] = v.trim();
      }
      await updateFn({ data: { user_id: userId, profile: profilePatch, bank: bankPatch } });
      toast.success("Employee updated");
      setEditMode(false);
      qc.invalidateQueries({ queryKey: ["admin-employee-full", userId] });
      qc.invalidateQueries({ queryKey: ["directory-profiles"] });
      qc.invalidateQueries({ queryKey: ["salary-export-banks"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function openDoc(dt: OnboardingDocType) {
    if (!userId) return;
    try {
      const r = await getUrlFn({ data: { user_id: userId, doc_type: dt } });
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to open");
    }
  }

  async function uploadDoc(dt: OnboardingDocType, file: File) {
    if (!userId) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("File must be under 10 MB"); return; }
    setUploading(dt);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const buf = await file.arrayBuffer();
      // base64 encode
      let binary = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      const file_base64 = btoa(binary);
      await uploadFn({ data: { user_id: userId, doc_type: dt, file_base64, ext, content_type: file.type || undefined } });
      toast.success(`${DOC_LABELS[dt]} uploaded`);
      qc.invalidateQueries({ queryKey: ["admin-employee-full", userId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="font-display flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                {profileForm.full_name || (data?.profile as { email?: string } | null)?.email || "Employee"}
              </SheetTitle>
              <SheetDescription>
                {(data?.profile as { email?: string } | null)?.email} · {profileForm.department || "—"}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {editMode ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setEditMode(false)} disabled={saving}>
                    <XIcon className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button size="sm" className="gradient-primary" onClick={save} disabled={saving}>
                    <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save"}
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        {isLoading || !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            <div className="flex flex-wrap gap-2">
              {data.isSuperAdmin && <Badge>super admin</Badge>}
              {data.roles.map((r) => (
                <Badge key={r} variant="secondary" className="capitalize">{r.replace("_", " ")}</Badge>
              ))}
              {data.salary && (
                <Badge variant="outline">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  ₹{(data.salary as any).monthly_salary?.toLocaleString?.("en-IN") ?? (data.salary as any).monthly_salary}/mo
                </Badge>
              )}
            </div>

            <Section title="Identity">
              <Grid>
                <FieldEditable label="Full name" value={profileForm.full_name} onChange={(v) => setProfileForm({ ...profileForm, full_name: v })} edit={editMode} />
                <FieldStatic label="Login email" value={(data.profile as { email?: string } | null)?.email ?? ""} />
                <FieldEditable label="Personal email" value={profileForm.personal_email} onChange={(v) => setProfileForm({ ...profileForm, personal_email: v })} edit={editMode} />
                <FieldEditable label="Phone" value={profileForm.phone} onChange={(v) => setProfileForm({ ...profileForm, phone: v })} edit={editMode} />
                <FieldEditable label="Date of birth" type="date" value={profileForm.date_of_birth} onChange={(v) => setProfileForm({ ...profileForm, date_of_birth: v })} edit={editMode} />
                <FieldEditable label="Marriage anniversary" type="date" value={profileForm.marriage_anniversary} onChange={(v) => setProfileForm({ ...profileForm, marriage_anniversary: v })} edit={editMode} />
              </Grid>
              <div className="mt-3">
                <FieldEditable label="Permanent address" value={profileForm.permanent_address} onChange={(v) => setProfileForm({ ...profileForm, permanent_address: v })} edit={editMode} multiline />
              </div>
              <div className="mt-3">
                <FieldEditable label="Hobbies / about" value={profileForm.hobbies} onChange={(v) => setProfileForm({ ...profileForm, hobbies: v })} edit={editMode} multiline />
              </div>
              {profileForm.profile_picture_url && (
                <div className="mt-3 flex items-center gap-3">
                  <img src={profileForm.profile_picture_url} alt="Profile" className="h-16 w-16 rounded-full object-cover border" />
                  {editMode && (
                    <Input value={profileForm.profile_picture_url} onChange={(e) => setProfileForm({ ...profileForm, profile_picture_url: e.target.value })} placeholder="Profile picture URL" />
                  )}
                </div>
              )}
            </Section>

            <Section title="Work">
              <Grid>
                <FieldEditable label="Department" value={profileForm.department} onChange={(v) => setProfileForm({ ...profileForm, department: v })} edit={editMode} />
                <FieldEditable label="Employment type" value={profileForm.employment_type} onChange={(v) => setProfileForm({ ...profileForm, employment_type: v })} edit={editMode} />
                <FieldEditable label="Joined on" type="date" value={profileForm.joined_on} onChange={(v) => setProfileForm({ ...profileForm, joined_on: v })} edit={editMode} />
                <FieldEditable label="Day start time" type="time" value={profileForm.day_start_time} onChange={(v) => setProfileForm({ ...profileForm, day_start_time: v })} edit={editMode} />
                <FieldEditable label="Standup time" type="time" value={profileForm.standup_time} onChange={(v) => setProfileForm({ ...profileForm, standup_time: v })} edit={editMode} />
              </Grid>
            </Section>

            <Section title="Social & links">
              <Grid>
                <FieldEditable label="LinkedIn" value={profileForm.linkedin_url} onChange={(v) => setProfileForm({ ...profileForm, linkedin_url: v })} edit={editMode} link />
                <FieldEditable label="GitHub" value={profileForm.github_url} onChange={(v) => setProfileForm({ ...profileForm, github_url: v })} edit={editMode} link />
                <FieldEditable label="Facebook" value={profileForm.facebook_url} onChange={(v) => setProfileForm({ ...profileForm, facebook_url: v })} edit={editMode} link />
                <FieldEditable label="Instagram" value={profileForm.instagram_url} onChange={(v) => setProfileForm({ ...profileForm, instagram_url: v })} edit={editMode} link />
                <FieldEditable label="X (Twitter)" value={profileForm.twitter_url} onChange={(v) => setProfileForm({ ...profileForm, twitter_url: v })} edit={editMode} link />
                <FieldEditable label="YouTube" value={profileForm.youtube_url} onChange={(v) => setProfileForm({ ...profileForm, youtube_url: v })} edit={editMode} link />
                <FieldEditable label="Pinterest" value={profileForm.pinterest_url} onChange={(v) => setProfileForm({ ...profileForm, pinterest_url: v })} edit={editMode} link />
              </Grid>
            </Section>

            <Section title="Bank details (payroll NEFT)">
              <Grid>
                <FieldEditable label="Account holder" value={bankForm.account_holder_name} onChange={(v) => setBankForm({ ...bankForm, account_holder_name: v })} edit={editMode} />
                <FieldEditable label="Account number" value={bankForm.account_number} onChange={(v) => setBankForm({ ...bankForm, account_number: v })} edit={editMode} />
                <FieldEditable label="IFSC code" value={bankForm.ifsc_code} onChange={(v) => setBankForm({ ...bankForm, ifsc_code: v.toUpperCase() })} edit={editMode} />
                <FieldEditable label="Bank branch" value={bankForm.bank_branch} onChange={(v) => setBankForm({ ...bankForm, bank_branch: v })} edit={editMode} />
                <FieldEditable label="PAN number" value={bankForm.pan_number} onChange={(v) => setBankForm({ ...bankForm, pan_number: v.toUpperCase() })} edit={editMode} />
              </Grid>
            </Section>

            <Section title="Documents & proofs">
              <div className="space-y-5">
                {DOC_GROUPS.map((g) => (
                  <div key={g.title} className="space-y-2">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">{g.title}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {g.keys.map((k) => {
                        const present = uploaded.has(k);
                        const isBusy = uploading === k;
                        return (
                          <div key={k} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-2 text-sm">
                            <div className="min-w-0 flex-1">
                              <div className="truncate">{DOC_LABELS[k]}</div>
                              <div className="mt-0.5">
                                {present ? (
                                  <Badge variant="outline" className="text-[10px] text-green-600 border-green-600/40">Uploaded</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Missing</Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {present && (
                                <Button size="sm" variant="ghost" onClick={() => openDoc(k)}>
                                  Open <ExternalLink className="h-3 w-3 ml-1" />
                                </Button>
                              )}
                              <label className="inline-flex">
                                <input
                                  type="file"
                                  className="hidden"
                                  accept="image/*,application/pdf"
                                  disabled={isBusy}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    e.target.value = "";
                                    if (f) uploadDoc(k, f);
                                  }}
                                />
                                <Button asChild size="sm" variant="ghost" disabled={isBusy}>
                                  <span>
                                    {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Upload className="h-3.5 w-3.5 mr-1" />{present ? "Replace" : "Upload"}</>}
                                  </span>
                                </Button>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Separator />
            <p className="text-xs text-muted-foreground">
              Role changes are managed under HR Admin → Access & Roles. Salary rows are managed in Finances.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function FieldStatic({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="text-sm">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function FieldEditable({
  label, value, onChange, edit, type, multiline, link,
}: {
  label: string; value: string; onChange: (v: string) => void; edit: boolean;
  type?: string; multiline?: boolean; link?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {edit ? (
        multiline ? (
          <Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <Input type={type ?? "text"} value={value} onChange={(e) => onChange(e.target.value)} />
        )
      ) : value ? (
        link ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">{value}</a>
        ) : (
          <div className="text-sm whitespace-pre-wrap break-words">{value}</div>
        )
      ) : (
        <div className="text-sm text-muted-foreground">—</div>
      )}
    </div>
  );
}
