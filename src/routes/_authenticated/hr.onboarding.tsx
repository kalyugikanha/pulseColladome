import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  listOnboardingSectionSubmissions,
  approveOnboardingSection,
  rejectOnboardingSection,
  type EmployeeOnboardingSummary,
} from "@/lib/onboarding-approvals.functions";
import {
  getEmployeeOnboarding,
  getEmployeeDocumentUrl,
  type OnboardingDocType,
} from "@/lib/onboarding.functions";
import {
  ONBOARDING_SECTIONS,
  SECTION_LABELS,
  SECTION_SHORT,
  type OnboardingSection,
  type SectionRow,
} from "@/lib/onboarding-sections";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { ClipboardCheck, ExternalLink, Loader2, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/hr/onboarding")({
  beforeLoad: () => { throw redirect({ to: "/hr-admin", search: { tab: "approvals" } }); },
});

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

const DOCS_BY_SECTION: Record<OnboardingSection, OnboardingDocType[]> = {
  personal: [],
  work: [],
  bank: [],
  documents: ["profile_picture","offer_letter","aadhar","pan","cancelled_cheque","marksheet_10","marksheet_12","graduation","masters","resume"],
  follow: ["follow_facebook","follow_instagram","follow_twitter","follow_linkedin","follow_youtube","follow_pinterest","follow_whatsapp"],
  reviews: ["review_google_jaipur","review_google_hyderabad","review_glassdoor","review_ambitionbox"],
  linkedin_employment: ["linkedin_employment"],
};

type FilterKey = "any_pending" | "any_rejected" | "all_approved" | "all";

export function HrOnboardingPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const listFn = useServerFn(listOnboardingSectionSubmissions);

  if (me && !me.isSuperAdmin && !me.isHrAdmin) throw redirect({ to: "/dashboard" });

  const [filter, setFilter] = useState<FilterKey>("any_pending");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["onboarding-section-submissions", filter],
    queryFn: () => listFn({ data: { filter } }) as Promise<EmployeeOnboardingSummary[]>,
    enabled: !!me,
  });

  const openRow = rows.find((r) => r.user_id === openId) ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-primary" /> Onboarding approvals
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Review each section on its own. Approve one at a time — portal access unlocks only when every required section is approved.</p>
      </header>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
        <TabsList>
          <TabsTrigger value="any_pending">Awaiting review</TabsTrigger>
          <TabsTrigger value="any_rejected">Sent back</TabsTrigger>
          <TabsTrigger value="all_approved">Fully approved</TabsTrigger>
          <TabsTrigger value="all">All employees</TabsTrigger>
        </TabsList>
        <TabsContent value={filter} className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">
                {filter === "any_pending" ? "Sections awaiting review"
                  : filter === "any_rejected" ? "Sections sent back"
                  : filter === "all_approved" ? "Fully approved employees"
                  : "All employees"}
              </CardTitle>
              <CardDescription>{rows.length} employee{rows.length === 1 ? "" : "s"}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : rows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6">Nothing here.</div>
              ) : (
                <div className="rounded-lg border border-border/60 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Employee</th>
                        <th className="text-left px-3 py-2">Department</th>
                        <th className="text-left px-3 py-2">Sections</th>
                        <th className="text-left px-3 py-2">Progress</th>
                        <th className="text-right px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.user_id} className="border-t border-border/40 hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(r.user_id)}>
                          <td className="px-3 py-2">
                            <div className="font-medium">{r.full_name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{r.email ?? "—"}</div>
                          </td>
                          <td className="px-3 py-2">{r.department ? <Badge variant="outline">{r.department}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {r.sections.map((s) => (
                                <SectionPill key={s.section} label={SECTION_SHORT[s.section]} row={s} />
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={r.fully_approved ? "text-green-600" : "text-muted-foreground"}>
                              {r.approved_count}/{r.required_count} approved
                            </span>
                            {r.pending_count > 0 && <span className="ml-2 text-amber-600">· {r.pending_count} pending</span>}
                            {r.rejected_count > 0 && <span className="ml-2 text-destructive">· {r.rejected_count} sent back</span>}
                          </td>
                          <td className="px-3 py-2 text-right"><Button size="sm" variant="ghost">Review</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ReviewSheet
        summary={openRow}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ["onboarding-section-submissions"] });
        }}
      />
    </div>
  );
}

function SectionPill({ label, row }: { label: string; row: SectionRow }) {
  if (!row.required) return <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">{label}·off</span>;
  const map: Record<string, string> = {
    approved: "text-green-600 border-green-600/40 bg-green-500/10",
    submitted: "text-amber-600 border-amber-500/40 bg-amber-500/10",
    rejected: "text-destructive border-destructive/40 bg-destructive/10",
    draft: "text-muted-foreground border-border/60 bg-muted/40",
  };
  return <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] ${map[row.status]}`}>{label}</span>;
}

function ReviewSheet({ summary, onClose, onChanged }: {
  summary: EmployeeOnboardingSummary | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const getDetails = useServerFn(getEmployeeOnboarding);
  const getUrl = useServerFn(getEmployeeDocumentUrl);
  const approveFn = useServerFn(approveOnboardingSection);
  const rejectFn = useServerFn(rejectOnboardingSection);
  const [rejectingSection, setRejectingSection] = useState<OnboardingSection | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<OnboardingSection | null>(null);

  const { data: details, refetch } = useQuery({
    queryKey: ["hr-onboarding-details", summary?.user_id],
    enabled: !!summary?.user_id,
    queryFn: () => getDetails({ data: { user_id: summary!.user_id } }),
  });

  const uploaded = useMemo(() => new Set((details?.documents ?? []).map((d) => d.doc_type)), [details]);
  const sectionMap = useMemo(() => {
    const m = new Map<OnboardingSection, SectionRow>();
    (details?.sections ?? []).forEach((s) => m.set(s.section, s));
    (summary?.sections ?? []).forEach((s) => { if (!m.has(s.section)) m.set(s.section, s); });
    return m;
  }, [details, summary]);

  async function approve(section: OnboardingSection) {
    if (!summary) return;
    setBusy(section);
    try {
      const res = await approveFn({ data: { user_id: summary.user_id, section } });
      toast.success(res.welcome_task_created ? "Approved — welcome-post task sent to Kanishka" : "Section approved");
      onChanged();
      refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Approval failed"); }
    finally { setBusy(null); }
  }

  async function reject(section: OnboardingSection) {
    if (!summary || !reason.trim()) return;
    setBusy(section);
    try {
      await rejectFn({ data: { user_id: summary.user_id, section, reason } });
      toast.success("Section sent back");
      setRejectingSection(null);
      setReason("");
      onChanged();
      refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }

  return (
    <Sheet open={!!summary} onOpenChange={(o) => { if (!o) { onClose(); setRejectingSection(null); setReason(""); } }}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">{summary?.full_name ?? "—"}</SheetTitle>
          <SheetDescription>{summary?.email} · {summary?.department ?? "—"}</SheetDescription>
        </SheetHeader>

        {summary && (
          <div className="mt-4 space-y-3">
            {ONBOARDING_SECTIONS.map((section) => {
              const row = sectionMap.get(section);
              const required = row?.required !== false;
              const status = row?.status ?? "draft";
              const rejecting = rejectingSection === section;
              const statusMap: Record<string, { label: string; className: string }> = {
                approved: { label: "Approved", className: "text-green-600 border-green-600/40 bg-green-500/10" },
                submitted: { label: "Awaiting review", className: "text-amber-600 border-amber-500/40 bg-amber-500/10" },
                rejected: { label: "Sent back", className: "text-destructive border-destructive/40 bg-destructive/10" },
                draft: { label: "Not submitted", className: "text-muted-foreground border-border/60 bg-muted/40" },
              };
              const s = statusMap[status];
              return (
                <Card key={section}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base font-display">{SECTION_LABELS[section]}</CardTitle>
                      <div className="flex items-center gap-2">
                        {!required && <Badge variant="outline" className="text-[10px]">Not required</Badge>}
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${s.className}`}>{s.label}</span>
                      </div>
                    </div>
                    {row?.submitted_at && <div className="text-[11px] text-muted-foreground">Submitted {format(new Date(row.submitted_at), "d MMM yyyy, HH:mm")}</div>}
                    {row?.approved_at && <div className="text-[11px] text-muted-foreground">Approved {format(new Date(row.approved_at), "d MMM yyyy, HH:mm")}</div>}
                    {row?.rejected_at && row.rejection_reason && (
                      <div className="mt-1 text-xs text-destructive whitespace-pre-wrap">Reason: {row.rejection_reason}</div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <SectionBody section={section} details={details} uploaded={uploaded} onOpen={async (k) => {
                      try {
                        const r = await getUrl({ data: { user_id: summary.user_id, doc_type: k } });
                        window.open(r.url, "_blank", "noopener");
                      } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to open"); }
                    }} />

                    {required && (status === "submitted" || status === "approved" || status === "rejected") && (
                      <div className="border-t border-border pt-3">
                        {rejecting ? (
                          <div className="space-y-2">
                            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs to be fixed?" />
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => { setRejectingSection(null); setReason(""); }} disabled={busy === section}>Cancel</Button>
                              <Button variant="destructive" size="sm" onClick={() => reject(section)} disabled={busy === section || !reason.trim()}>
                                <X className="h-3.5 w-3.5 mr-1" /> Send back
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => { setRejectingSection(section); setReason(""); }}>Send back with reason</Button>
                            <Button size="sm" className="gradient-primary" onClick={() => approve(section)} disabled={busy === section || status === "approved"}>
                              <Check className="h-3.5 w-3.5 mr-1" /> {status === "approved" ? "Approved" : "Approve"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

type DetailsShape = {
  profile: Record<string, unknown> | null;
  bank: Record<string, unknown> | null;
} | undefined | null;

function SectionBody({ section, details, uploaded, onOpen }: {
  section: OnboardingSection;
  details: DetailsShape;
  uploaded: Set<OnboardingDocType>;
  onOpen: (k: OnboardingDocType) => void;
}) {
  const p = (details?.profile ?? {}) as Record<string, string | null | undefined>;
  const b = (details?.bank ?? {}) as Record<string, string | null | undefined>;
  if (section === "personal") return (
    <div className="grid gap-1">
      <KV k="Personal email" v={p.personal_email} />
      <KV k="Phone" v={p.phone} />
      <KV k="Date of birth" v={p.date_of_birth} />
      <KV k="Address" v={p.permanent_address} />
      <KV k="LinkedIn" v={p.linkedin_url} link />
      <KV k="GitHub" v={p.github_url} link />
      <KV k="Facebook" v={p.facebook_url} link />
      <KV k="Instagram" v={p.instagram_url} link />
      <KV k="X (Twitter)" v={p.twitter_url} link />
      <KV k="Hobbies / about" v={p.hobbies} />
    </div>
  );
  if (section === "work") return (
    <div className="grid gap-1">
      <KV k="Department" v={p.department} />
      <KV k="Joined on" v={p.joined_on} />
      <KV k="Day start" v={p.day_start_time} />
      <KV k="Standup" v={p.standup_time} />
    </div>
  );
  if (section === "bank") return (
    <div className="grid gap-1">
      <KV k="Account holder" v={b.account_holder_name} />
      <KV k="Account number" v={b.account_number} />
      <KV k="IFSC" v={b.ifsc_code} />
      <KV k="PAN" v={b.pan_number} />
      <KV k="Branch" v={b.bank_branch} />
    </div>
  );
  const docs = DOCS_BY_SECTION[section];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {docs.map((k) => (
        <DocLinkRow key={k} label={DOC_LABELS[k]} present={uploaded.has(k)} onOpen={() => onOpen(k)} />
      ))}
    </div>
  );
}

function KV({ k, v, link }: { k: string; v?: string | null; link?: boolean }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <div className="w-32 shrink-0 text-muted-foreground text-xs">{k}</div>
      <div className="min-w-0 flex-1">
        {v ? (link ? <a href={v} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{v}</a> : <span className="whitespace-pre-wrap break-words">{v}</span>) : <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

function DocLinkRow({ label, present, onOpen }: { label: string; present: boolean; onOpen: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 text-sm">
      <div className="truncate">
        {label} {present
          ? <Badge variant="outline" className="ml-1 text-[10px] text-green-600 border-green-600/40">Uploaded</Badge>
          : <Badge variant="outline" className="ml-1 text-[10px] text-muted-foreground">Missing</Badge>}
      </div>
      {present && (
        <Button size="sm" variant="ghost" onClick={onOpen}>
          Open <ExternalLink className="h-3 w-3 ml-1" />
        </Button>
      )}
    </div>
  );
}
