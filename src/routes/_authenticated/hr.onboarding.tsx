import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  listOnboardingSubmissions,
  approveOnboarding,
  rejectOnboarding,
} from "@/lib/onboarding-approvals.functions";
import {
  getEmployeeOnboarding,
  getEmployeeDocumentUrl,
  type OnboardingDocType,
} from "@/lib/onboarding.functions";
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

type SubmissionRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  joined_on: string | null;
  onboarding_submitted_at: string | null;
  onboarding_approved_at: string | null;
  onboarding_rejected_at: string | null;
  onboarding_rejection_reason: string | null;
  hobbies: string | null;
  linkedin_url: string | null;
};

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

function HrOnboardingPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const listFn = useServerFn(listOnboardingSubmissions);
  const approveFn = useServerFn(approveOnboarding);
  const rejectFn = useServerFn(rejectOnboarding);

  if (me && !me.isSuperAdmin && !me.isHrAdmin) throw redirect({ to: "/dashboard" });

  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["onboarding-submissions", tab],
    queryFn: () => listFn({ data: { status: tab } }) as Promise<SubmissionRow[]>,
    enabled: !!me,
  });

  const openRow = rows.find((r) => r.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-primary" /> Onboarding approvals
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Review new-hire submissions, verify screenshots, and approve to unlock portal access.</p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Sent back</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">
                {tab === "pending" ? "Awaiting review" : tab === "approved" ? "Approved" : "Sent back for edits"}
              </CardTitle>
              <CardDescription>{rows.length} member{rows.length === 1 ? "" : "s"}</CardDescription>
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
                        <th className="text-left px-3 py-2">Name</th>
                        <th className="text-left px-3 py-2">Email</th>
                        <th className="text-left px-3 py-2">Department</th>
                        <th className="text-left px-3 py-2">{tab === "approved" ? "Approved" : tab === "rejected" ? "Sent back" : "Submitted"}</th>
                        <th className="text-right px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const ts = tab === "approved" ? r.onboarding_approved_at : tab === "rejected" ? r.onboarding_rejected_at : r.onboarding_submitted_at;
                        return (
                          <tr key={r.id} className="border-t border-border/40 hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(r.id)}>
                            <td className="px-3 py-2 font-medium">{r.full_name ?? "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.email ?? "—"}</td>
                            <td className="px-3 py-2">{r.department ? <Badge variant="outline">{r.department}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-2">{ts ? format(new Date(ts), "d MMM yyyy, HH:mm") : "—"}</td>
                            <td className="px-3 py-2 text-right"><Button size="sm" variant="ghost">Review</Button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ReviewSheet
        row={openRow}
        onClose={() => setOpenId(null)}
        onApprove={async (id) => {
          try {
            const res = await approveFn({ data: { user_id: id } });
            toast.success(res.welcome_task_created ? "Approved — welcome-post task sent to Kanishka" : "Approved");
            setOpenId(null);
            qc.invalidateQueries({ queryKey: ["onboarding-submissions"] });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Approval failed");
          }
        }}
        onReject={async (id, reason) => {
          try {
            await rejectFn({ data: { user_id: id, reason } });
            toast.success("Sent back to the employee");
            setOpenId(null);
            qc.invalidateQueries({ queryKey: ["onboarding-submissions"] });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
        }}
      />
    </div>
  );
}

function ReviewSheet({ row, onClose, onApprove, onReject }: {
  row: SubmissionRow | null;
  onClose: () => void;
  onApprove: (id: string) => void | Promise<void>;
  onReject: (id: string, reason: string) => void | Promise<void>;
}) {
  const getDetails = useServerFn(getEmployeeOnboarding);
  const getUrl = useServerFn(getEmployeeDocumentUrl);
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: details } = useQuery({
    queryKey: ["hr-onboarding-details", row?.id],
    enabled: !!row?.id,
    queryFn: () => getDetails({ data: { user_id: row!.id } }),
  });

  const uploaded = useMemo(() => new Set((details?.documents ?? []).map((d) => d.doc_type)), [details]);

  return (
    <Sheet open={!!row} onOpenChange={(o) => { if (!o) { onClose(); setRejectMode(false); setReason(""); } }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">{row?.full_name ?? "—"}</SheetTitle>
          <SheetDescription>{row?.email} · {row?.department ?? "—"}</SheetDescription>
        </SheetHeader>

        {row && (
          <div className="mt-4 space-y-6">
            <Section title="Personal">
              <KV k="Personal email" v={(details?.profile as { personal_email?: string | null } | null)?.personal_email} />
              <KV k="Phone" v={(details?.profile as { phone?: string | null } | null)?.phone} />
              <KV k="Date of birth" v={(details?.profile as { date_of_birth?: string | null } | null)?.date_of_birth} />
              <KV k="Address" v={(details?.profile as { permanent_address?: string | null } | null)?.permanent_address} />
              <KV k="LinkedIn" v={row.linkedin_url} link />
              <KV k="Hobbies / about" v={row.hobbies} />
            </Section>

            <Section title="Work">
              <KV k="Department" v={row.department} />
              <KV k="Joined on" v={row.joined_on} />
              <KV k="Day start" v={(details?.profile as { day_start_time?: string | null } | null)?.day_start_time} />
              <KV k="Standup" v={(details?.profile as { standup_time?: string | null } | null)?.standup_time} />
            </Section>

            <Section title="Bank">
              <KV k="Account holder" v={(details?.bank as { account_holder_name?: string | null } | null)?.account_holder_name} />
              <KV k="Account number" v={(details?.bank as { account_number?: string | null } | null)?.account_number} />
              <KV k="IFSC" v={(details?.bank as { ifsc_code?: string | null } | null)?.ifsc_code} />
              <KV k="PAN" v={(details?.bank as { pan_number?: string | null } | null)?.pan_number} />
              <KV k="Branch" v={(details?.bank as { bank_branch?: string | null } | null)?.bank_branch} />
            </Section>

            <Section title="Uploaded documents & proofs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.keys(DOC_LABELS) as OnboardingDocType[]).map((k) => (
                  <DocLinkRow key={k} label={DOC_LABELS[k]} present={uploaded.has(k)} onOpen={async () => {
                    try {
                      const r = await getUrl({ data: { user_id: row.id, doc_type: k } });
                      window.open(r.url, "_blank", "noopener");
                    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to open"); }
                  }} />
                ))}
              </div>
            </Section>

            {!row.onboarding_approved_at && (
              <div className="border-t border-border pt-4 space-y-3">
                {rejectMode ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs uppercase tracking-wider text-muted-foreground">Reason to send back</label>
                      <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs to be fixed?" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => { setRejectMode(false); setReason(""); }} disabled={busy}>Cancel</Button>
                      <Button variant="destructive" onClick={async () => { setBusy(true); await onReject(row.id, reason); setBusy(false); }} disabled={busy || !reason.trim()}>
                        <X className="h-4 w-4 mr-1" /> Send back
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={() => setRejectMode(true)}>Send back with reason</Button>
                    <Button className="gradient-primary" onClick={async () => { setBusy(true); await onApprove(row.id); setBusy(false); }} disabled={busy}>
                      <Check className="h-4 w-4 mr-1" /> Approve & create welcome post task
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="grid gap-1 text-sm">{children}</div>
    </section>
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
        {label} {present ? <Badge variant="outline" className="ml-1 text-[10px] text-green-600 border-green-600/40">Uploaded</Badge> : <Badge variant="outline" className="ml-1 text-[10px] text-muted-foreground">Missing</Badge>}
      </div>
      {present && (
        <Button size="sm" variant="ghost" onClick={onOpen}>
          Open <ExternalLink className="h-3 w-3 ml-1" />
        </Button>
      )}
    </div>
  );
}
