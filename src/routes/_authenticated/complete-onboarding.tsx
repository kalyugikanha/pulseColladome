import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
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
import { CheckCircle2, Upload, Loader2, ClipboardCheck, ExternalLink, Heart, Star, Linkedin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/complete-onboarding")({
  component: CompleteOnboardingPage,
});

type DocSpec = { key: OnboardingDocType; label: string; required: boolean; accept: string; link?: string };

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

const FOLLOW_PROOFS: DocSpec[] = [
  { key: "follow_facebook",  label: "Facebook — followed",       required: true, accept: "image/*", link: "https://www.facebook.com/socialcolladome/" },
  { key: "follow_instagram", label: "Instagram — followed",      required: true, accept: "image/*", link: "https://www.instagram.com/socialcolladome" },
  { key: "follow_twitter",   label: "X (Twitter) — followed",    required: true, accept: "image/*", link: "https://x.com/SocialColladome" },
  { key: "follow_linkedin",  label: "LinkedIn page — followed",  required: true, accept: "image/*", link: "https://www.linkedin.com/company/colladome/" },
  { key: "follow_youtube",   label: "YouTube — subscribed",      required: true, accept: "image/*", link: "https://www.youtube.com/channel/UCYXQcDiCeW6QVr5oBHWs0uQ" },
  { key: "follow_pinterest", label: "Pinterest — followed",      required: true, accept: "image/*", link: "https://in.pinterest.com/SocialColladome/" },
  { key: "follow_whatsapp",  label: "WhatsApp channel — joined", required: true, accept: "image/*", link: "https://whatsapp.com/channel/0029VaCRgsEBA1etwQIXHy2C" },
];

const REVIEW_PROOFS: DocSpec[] = [
  { key: "review_google_jaipur",    label: "Google Review — Jaipur office",    required: true, accept: "image/*", link: "https://g.page/r/CWFNs919eeVQEBM/review" },
  { key: "review_google_hyderabad", label: "Google Review — Hyderabad office", required: true, accept: "image/*", link: "https://www.google.com/search?q=Colladome+Hyderabad+review" },
  { key: "review_glassdoor",        label: "Glassdoor Review",                 required: true, accept: "image/*", link: "https://www.glassdoor.co.in/Reviews/Colladome-Reviews-E5488688.htm" },
  { key: "review_ambitionbox",      label: "AmbitionBox Review",               required: true, accept: "image/*", link: "https://www.ambitionbox.com/reviews/colladome-reviews" },
];

const LINKEDIN_EMPLOYMENT: DocSpec = {
  key: "linkedin_employment",
  label: "LinkedIn profile — shows \"Works at Colladome\"",
  required: true,
  accept: "image/*",
  link: "https://www.linkedin.com/in/me/edit/topcard/",
};

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

  const [fullName, setFullName] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [dob, setDob] = useState("");
  const [anniversary, setAnniversary] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [github, setGithub] = useState("");
  const [facebook, setFacebook] = useState("");
  const [instagram, setInstagram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [youtube, setYoutube] = useState("");
  const [pinterest, setPinterest] = useState("");
  const [department, setDepartment] = useState("");
  const [dayStart, setDayStart] = useState("");
  const [standup, setStandup] = useState("");
  const [hobbies, setHobbies] = useState("");
  const [holder, setHolder] = useState("");
  const [account, setAccount] = useState("");
  const [branch, setBranch] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [pan, setPan] = useState("");

  const [uploading, setUploading] = useState<OnboardingDocType | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Auto-save state
  type AutoStatus = "idle" | "unsaved" | "saving" | "saved" | "error";
  const [autoStatus, setAutoStatus] = useState<AutoStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const hydratedRef = useRef(false);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const lastErrorToastRef = useRef(0);

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
    setFacebook(p.facebook_url ?? "");
    setInstagram(p.instagram_url ?? "");
    setTwitter(p.twitter_url ?? "");
    setYoutube(p.youtube_url ?? "");
    setPinterest(p.pinterest_url ?? "");
    setDepartment(p.department ?? "");
    setDayStart(p.day_start_time ?? "");
    setStandup(p.standup_time ?? "");
    setHobbies(p.hobbies ?? "");
    const b = (data.bank ?? {}) as Record<string, string | null>;
    setHolder(b.account_holder_name ?? "");
    setAccount(b.account_number ?? "");
    setBranch(b.bank_branch ?? "");
    setIfsc(b.ifsc_code ?? "");
    setPan(b.pan_number ?? "");
    // Mark hydrated on the next tick so the field-hydration setState calls
    // do not trigger a spurious auto-save.
    const t = setTimeout(() => {
      hydratedRef.current = true;
      setAutoStatus("saved");
    }, 50);
    return () => clearTimeout(t);
  }, [data]);

  // Serialized payload for both auto-save and manual save
  const autoSavePayload = useMemo(() => ({
    profile: {
      full_name: fullName.trim() || null,
      personal_email: personalEmail.trim() || null,
      phone: phone.trim() || null,
      permanent_address: address.trim() || null,
      date_of_birth: dob || null,
      marriage_anniversary: anniversary || null,
      linkedin_url: linkedin.trim() || null,
      github_url: github.trim() || null,
      facebook_url: facebook.trim() || null,
      instagram_url: instagram.trim() || null,
      twitter_url: twitter.trim() || null,
      youtube_url: youtube.trim() || null,
      pinterest_url: pinterest.trim() || null,
      department: department.trim() || null,
      day_start_time: dayStart || null,
      standup_time: standup || null,
      hobbies: hobbies.trim() || null,
    },
    bank: {
      account_holder_name: holder.trim(),
      account_number: account.trim(),
      bank_branch: branch.trim(),
      ifsc_code: ifsc.trim().toUpperCase(),
      pan_number: pan.trim().toUpperCase(),
    },
  }), [fullName, personalEmail, phone, address, dob, anniversary, linkedin, github, facebook, instagram, twitter, youtube, pinterest, department, dayStart, standup, hobbies, holder, account, branch, ifsc, pan]);

  // Debounced auto-save on any field change
  useEffect(() => {
    if (!hydratedRef.current) return;
    setAutoStatus((prev) => (prev === "saving" ? prev : "unsaved"));
    const t = setTimeout(async () => {
      if (inFlightRef.current) { pendingRef.current = true; return; }
      const runSave = async () => {
        inFlightRef.current = true;
        setAutoStatus("saving");
        try {
          await saveOnboarding({ data: autoSavePayload });
          setLastSavedAt(new Date());
          setAutoStatus("saved");
        } catch (e: unknown) {
          setAutoStatus("error");
          const now = Date.now();
          if (now - lastErrorToastRef.current > 30000) {
            lastErrorToastRef.current = now;
            toast.error(e instanceof Error ? `Auto-save failed: ${e.message}` : "Auto-save failed");
          }
        } finally {
          inFlightRef.current = false;
          if (pendingRef.current) {
            pendingRef.current = false;
            await runSave();
          }
        }
      };
      await runSave();
    }, 800);
    return () => clearTimeout(t);
  }, [autoSavePayload, saveOnboarding]);

  // Best-effort flush on tab close / hide
  useEffect(() => {
    const flush = () => {
      if (!hydratedRef.current) return;
      // Fire-and-forget; not guaranteed to reach server during unload.
      saveOnboarding({ data: autoSavePayload }).catch(() => {});
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [autoSavePayload, saveOnboarding]);


  const uploaded = new Set((data?.documents ?? []).map((d) => d.doc_type));
  const profileAny = (data?.profile ?? {}) as Record<string, unknown>;
  const submittedAt = profileAny.onboarding_submitted_at as string | null | undefined;
  const approvedAt = profileAny.onboarding_approved_at as string | null | undefined;
  const rejectedAt = profileAny.onboarding_rejected_at as string | null | undefined;
  const rejectionReason = profileAny.onboarding_rejection_reason as string | null | undefined;
  const isApproved = !!approvedAt;
  const isPendingReview = !!submittedAt && !isApproved;

  // ---- Profile completion % ----
  const profileFieldValues: Record<string, string> = {
    full_name: fullName, personal_email: personalEmail, phone, permanent_address: address,
    date_of_birth: dob, linkedin_url: linkedin, github_url: github, facebook_url: facebook,
    instagram_url: instagram, twitter_url: twitter, department, day_start_time: dayStart, standup_time: standup,
  };
  const bankFieldValues: Record<string, string> = {
    account_holder_name: holder, account_number: account, bank_branch: branch, ifsc_code: ifsc, pan_number: pan,
  };
  const requiredDocKeys: OnboardingDocType[] = [
    "profile_picture","offer_letter","aadhar","pan","cancelled_cheque",
    "marksheet_10","marksheet_12","graduation","resume",
    "follow_facebook","follow_instagram","follow_twitter","follow_linkedin",
    "follow_youtube","follow_pinterest","follow_whatsapp",
    "review_google_jaipur","review_google_hyderabad","review_glassdoor","review_ambitionbox",
    "linkedin_employment",
  ];
  const filledProfile = Object.values(profileFieldValues).filter((v) => v && v.trim() !== "").length;
  const filledBank = Object.values(bankFieldValues).filter((v) => v && v.trim() !== "").length;
  const filledDocs = requiredDocKeys.filter((k) => uploaded.has(k)).length;
  const totalItems = Object.keys(profileFieldValues).length + Object.keys(bankFieldValues).length + requiredDocKeys.length;
  const filledItems = filledProfile + filledBank + filledDocs;
  const completionPct = Math.round((filledItems / totalItems) * 100);

  async function saveDraft(silent = false) {
    setSaving(true);
    setAutoStatus("saving");
    try {
      await saveOnboarding({ data: autoSavePayload });
      setLastSavedAt(new Date());
      setAutoStatus("saved");
      if (!silent) toast.success("Progress saved");
      qc.invalidateQueries({ queryKey: ["my-onboarding"] });
    } catch (e: unknown) {
      setAutoStatus("error");
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
    if (isApproved) {
      await saveDraft(true);
      qc.invalidateQueries({ queryKey: ["current-user"] });
      qc.invalidateQueries({ queryKey: ["my-onboarding"] });
      return;
    }
    setSubmitting(true);
    try {
      await saveDraft();
      const res = await finalize();
      if (!res.ok) {
        toast.error(`Please complete: ${res.missing.slice(0, 3).join(", ")}${res.missing.length > 3 ? "…" : ""}`);
        return;
      }
      toast.success("Submitted — waiting for HR approval");
      qc.invalidateQueries({ queryKey: ["current-user"] });
      qc.invalidateQueries({ queryKey: ["my-onboarding"] });
      router.navigate({ to: "/onboarding-pending", replace: true });
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
          <ClipboardCheck className="h-6 w-6 text-primary" /> {isApproved ? "My profile" : "Complete your onboarding"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isApproved
            ? "Update your details, documents, and social links anytime."
            : "Fill in your details, upload every document and screenshot proof, then submit for HR approval. Portal access unlocks once HR approves."}
        </p>
      </header>

      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div
            className="relative h-16 w-16 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold"
            style={{ background: `conic-gradient(hsl(var(--primary)) ${completionPct * 3.6}deg, hsl(var(--muted)) 0deg)` }}
          >
            <div className="absolute inset-1 rounded-full bg-background flex items-center justify-center">
              {completionPct}%
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Profile completion</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {filledProfile}/{Object.keys(profileFieldValues).length} personal · {filledBank}/{Object.keys(bankFieldValues).length} bank · {filledDocs}/{requiredDocKeys.length} documents
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {isApproved
                ? "HR has approved your onboarding — keep this up to date."
                : completionPct >= 100
                  ? "All set. Submit for HR approval."
                  : "Complete every section to unlock the Submit button."}
            </div>
          </div>
        </CardContent>
      </Card>


      {isPendingReview && (
        <div className="rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-sm">
          Your submission is waiting for HR approval. You can still edit and re-upload if needed.
        </div>
      )}
      {rejectedAt && !isApproved && !isPendingReview && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <div className="font-medium">HR sent your submission back.</div>
          {rejectionReason && <div className="mt-1 text-muted-foreground whitespace-pre-wrap">Reason: {rejectionReason}</div>}
          <div className="mt-1 text-muted-foreground">Please fix the items below and submit again.</div>
        </div>
      )}

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
          <Field label="Facebook profile *"><Input value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="https://facebook.com/…" /></Field>
          <Field label="Instagram profile *"><Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="https://instagram.com/…" /></Field>
          <Field label="X (Twitter) profile *"><Input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="https://x.com/…" /></Field>
          <Field label="YouTube channel (optional)"><Input value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="https://youtube.com/…" /></Field>
          <Field label="Pinterest profile (optional)" className="md:col-span-2"><Input value={pinterest} onChange={(e) => setPinterest(e.target.value)} placeholder="https://pinterest.com/…" /></Field>
          <Field label="Permanent address *" className="md:col-span-2"><Textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          <Field label="About you — hobbies, interests, fun facts (used for your welcome post)" className="md:col-span-2">
            <Textarea rows={3} value={hobbies} onChange={(e) => setHobbies(e.target.value)} placeholder="e.g. I love hiking on weekends, board games, and photography." />
          </Field>
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
          {DOCS.map((doc) => (
            <UploadRow key={doc.key} spec={doc} uploaded={uploaded.has(doc.key)} busy={uploading === doc.key} onUpload={(f) => uploadDoc(doc, f)} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" /> Follow Colladome — upload screenshot proof
          </CardTitle>
          <CardDescription>
            Open each link, follow / subscribe / join, then upload a screenshot showing you're following. All items are required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {FOLLOW_PROOFS.map((doc) => (
            <UploadRow key={doc.key} spec={doc} uploaded={uploaded.has(doc.key)} busy={uploading === doc.key} onUpload={(f) => uploadDoc(doc, f)} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" /> Leave a review — upload screenshot proof
          </CardTitle>
          <CardDescription>
            Open each platform, leave an honest review, then upload a screenshot of your published review. All items are required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {REVIEW_PROOFS.map((doc) => (
            <UploadRow key={doc.key} spec={doc} uploaded={uploaded.has(doc.key)} busy={uploading === doc.key} onUpload={(f) => uploadDoc(doc, f)} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Linkedin className="h-5 w-5 text-primary" /> Update your LinkedIn employment
          </CardTitle>
          <CardDescription>
            Add Colladome as your current employer on LinkedIn, then upload a screenshot of your LinkedIn profile showing "Works at Colladome".
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <UploadRow spec={LINKEDIN_EMPLOYMENT} uploaded={uploaded.has(LINKEDIN_EMPLOYMENT.key)} busy={uploading === LINKEDIN_EMPLOYMENT.key} onUpload={(f) => uploadDoc(LINKEDIN_EMPLOYMENT, f)} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2 pb-8">
        <AutoSaveStatusPill status={autoStatus} lastSavedAt={lastSavedAt} />
        <Button variant="outline" onClick={() => saveDraft()} disabled={saving || submitting}>
          {saving ? "Saving…" : "Save progress"}
        </Button>
        <Button className="gradient-primary" onClick={submit} disabled={submitting}>
          {submitting ? "Submitting…" : isApproved ? "Save changes" : isPendingReview ? "Re-submit for HR approval" : "Submit for HR approval"}
        </Button>
      </div>

    </div>
  );
}

function UploadRow({ spec, uploaded, busy, onUpload }: { spec: DocSpec; uploaded: boolean; busy: boolean; onUpload: (f: File) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
      <div className="flex items-center gap-2 text-sm min-w-0">
        {uploaded ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" /> : <Upload className="h-4 w-4 text-muted-foreground shrink-0" />}
        <span className="truncate">{spec.label}</span>
        {!spec.required && <Badge variant="outline" className="text-[10px]">Optional</Badge>}
        {uploaded && <Badge variant="outline" className="text-[10px] text-green-600 border-green-600/40">Uploaded</Badge>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {spec.link && (
          <Button asChild size="sm" variant="ghost">
            <a href={spec.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
              Open <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        )}
        <label className="cursor-pointer">
          <input
            type="file"
            accept={spec.accept}
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.currentTarget.value = "";
            }}
          />
          <Button asChild size="sm" variant="outline" disabled={busy}>
            <span>{busy ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Uploading…</> : uploaded ? "Replace" : "Upload"}</span>
          </Button>
        </label>
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
