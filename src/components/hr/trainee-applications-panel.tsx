import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  listTraineeApplications,
  approveTraineeApplication,
  rejectTraineeApplication,
  type TraineeApplication,
} from "@/lib/trainee-applications.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, X, GraduationCap, Mail, Phone } from "lucide-react";

type Filter = "pending" | "approved" | "rejected";

export function HrTraineeApplicationsPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const listFn = useServerFn(listTraineeApplications);
  const approveFn = useServerFn(approveTraineeApplication);
  const rejectFn = useServerFn(rejectTraineeApplication);

  const canAccess = !!(me?.isSuperAdmin || me?.isHrAdmin);

  const [filter, setFilter] = useState<Filter>("pending");
  const [rejectTarget, setRejectTarget] = useState<TraineeApplication | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: apps, isLoading } = useQuery({
    queryKey: ["trainee-applications"],
    enabled: canAccess,
    queryFn: () => listFn(),
  });

  if (!canAccess) {
    return <p className="text-sm text-muted-foreground">You don't have access to this page.</p>;
  }

  const rows = (apps ?? []).filter((a) => a.status === filter);

  async function approve(app: TraineeApplication) {
    setBusyId(app.id);
    try {
      await approveFn({ data: { id: app.id } });
      toast.success(`Approved — ${app.email} can now sign in as a trainee.`);
      qc.invalidateQueries({ queryKey: ["trainee-applications"] });
      qc.invalidateQueries({ queryKey: ["role-grants"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error("Please provide a short reason");
      return;
    }
    setRejecting(true);
    try {
      await rejectFn({ data: { id: rejectTarget.id, rejection_reason: reason } });
      toast.success("Application rejected");
      setRejectTarget(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["trainee-applications"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setRejecting(false);
    }
  }

  const counts = {
    pending: (apps ?? []).filter((a) => a.status === "pending").length,
    approved: (apps ?? []).filter((a) => a.status === "approved").length,
    rejected: (apps ?? []).filter((a) => a.status === "rejected").length,
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" /> Trainee applications
        </h2>
        <p className="text-sm text-muted-foreground">
          Applications submitted through the public <code className="px-1 rounded bg-muted">/apply</code> page.
          Approving grants the applicant the <strong>trainee</strong> role — they can then sign in with Google
          using the email they submitted.
        </p>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
        </TabsList>
        <TabsContent value={filter} className="mt-4 space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No {filter} applications.</p>
          )}
          {rows.map((app) => (
            <Card key={app.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {app.full_name}
                      {app.status === "pending" && <Badge variant="secondary">Pending</Badge>}
                      {app.status === "approved" && <Badge className="gradient-primary">Approved</Badge>}
                      {app.status === "rejected" && <Badge variant="destructive">Rejected</Badge>}
                    </CardTitle>
                    <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{app.email}</span>
                      {app.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{app.phone}</span>}
                      <span className="text-xs">Submitted {format(new Date(app.created_at), "MMM d, yyyy · p")}</span>
                    </CardDescription>
                  </div>
                  {app.status === "pending" && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setRejectTarget(app); setRejectReason(""); }}
                        disabled={busyId === app.id}
                      >
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        className="gradient-primary"
                        onClick={() => approve(app)}
                        disabled={busyId === app.id}
                      >
                        <Check className="h-4 w-4 mr-1" /> {busyId === app.id ? "Approving…" : "Approve"}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              {(app.note || app.rejection_reason || app.reviewed_at) && (
                <CardContent className="pt-0 space-y-2">
                  {app.note && (
                    <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                      {app.note}
                    </div>
                  )}
                  {app.status === "rejected" && app.rejection_reason && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                      <div className="text-xs uppercase tracking-wider text-destructive mb-1">Rejection reason</div>
                      {app.rejection_reason}
                    </div>
                  )}
                  {app.reviewed_at && (
                    <p className="text-xs text-muted-foreground">
                      Reviewed {format(new Date(app.reviewed_at), "MMM d, yyyy · p")}
                    </p>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject application?</AlertDialogTitle>
            <AlertDialogDescription>
              {rejectTarget && <>Reject the application from <strong>{rejectTarget.full_name}</strong> ({rejectTarget.email}). They will not be able to sign in.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Program is full for this cohort"
              rows={3}
              maxLength={500}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmReject(); }}
              disabled={rejecting}
            >
              {rejecting ? "Rejecting…" : "Reject application"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
