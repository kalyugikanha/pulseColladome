import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { BookOpen, ExternalLink, Upload, CheckCircle2, Clock3, AlertTriangle, Ban, RotateCcw, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/learning")({ component: LearningPage });

const GRACE_DAYS = 7;

type Course = {
  id: string;
  title: string;
  description: string | null;
  resource_url: string | null;
  due_date: string;
};

type Submission = {
  id: string;
  course_id: string;
  user_id: string;
  screenshot_path: string;
  status: "submitted" | "approved" | "rejected";
  rejection_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

type DerivedStatus = "upcoming" | "due" | "awaiting" | "completed" | "missed";

function statusFor(course: Course, sub: Submission | undefined): DerivedStatus {
  if (sub?.status === "approved") return "completed";
  if (sub?.status === "submitted") return "awaiting";
  const due = parseISO(course.due_date);
  const today = new Date();
  const daysPastDue = differenceInCalendarDays(today, due);
  if (daysPastDue < 0) return "upcoming";
  if (daysPastDue <= GRACE_DAYS) return "due";
  return "missed";
}

function StatusBadge({ status }: { status: DerivedStatus }) {
  const map: Record<DerivedStatus, { label: string; className: string; Icon: typeof Clock3 }> = {
    upcoming: { label: "Upcoming", className: "bg-slate-500/15 text-slate-600 border-slate-500/30", Icon: Clock3 },
    due: { label: "Due", className: "bg-amber-500/15 text-amber-700 border-amber-500/30", Icon: AlertTriangle },
    awaiting: { label: "Awaiting review", className: "bg-blue-500/15 text-blue-700 border-blue-500/30", Icon: RotateCcw },
    completed: { label: "Completed", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", Icon: CheckCircle2 },
    missed: { label: "Missed", className: "bg-red-500/15 text-red-700 border-red-500/30", Icon: Ban },
  };
  const { label, className, Icon } = map[status];
  return <Badge variant="outline" className={className}><Icon className="h-3 w-3 mr-1" />{label}</Badge>;
}

function LearningPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();

  const { data: myDept } = useQuery({
    queryKey: ["me-department", me?.id],
    enabled: !!me,
    queryFn: async () => (await supabase.from("profiles").select("department").eq("id", me!.id).maybeSingle()).data?.department ?? null,
  });

  const { data: assigned = [] } = useQuery({
    queryKey: ["my-courses", me?.id, myDept],
    enabled: !!me,
    queryFn: async () => {
      // Fetch course_ids targeted at me individually or via my dept
      const [{ data: byUser }, { data: byDept }] = await Promise.all([
        supabase.from("course_targets").select("course_id").eq("user_id", me!.id),
        myDept
          ? supabase.from("course_targets").select("course_id").eq("department", myDept)
          : Promise.resolve({ data: [] as { course_id: string }[] }),
      ]);
      const ids = Array.from(new Set([...(byUser ?? []), ...(byDept ?? [])].map((r) => r.course_id)));
      if (ids.length === 0) return [] as Course[];
      const { data: courses } = await supabase.from("courses").select("id,title,description,resource_url,due_date").in("id", ids).order("due_date", { ascending: true });
      return (courses ?? []) as Course[];
    },
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["my-submissions", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("course_submissions").select("*").eq("user_id", me!.id);
      return (data ?? []) as Submission[];
    },
  });

  const subByCourse = useMemo(() => {
    const m = new Map<string, Submission>();
    for (const s of submissions) m.set(s.course_id, s);
    return m;
  }, [submissions]);

  const grouped = useMemo(() => {
    const rows = assigned.map((c) => ({ course: c, sub: subByCourse.get(c.id), status: statusFor(c, subByCourse.get(c.id)) }));
    const order: DerivedStatus[] = ["due", "awaiting", "upcoming", "completed", "missed"];
    return rows.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.course.due_date.localeCompare(b.course.due_date));
  }, [assigned, subByCourse]);

  const [uploadFor, setUploadFor] = useState<Course | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitProof() {
    if (!me || !uploadFor || !file) return;
    setBusy(true);
    try {
      const path = `${me.id}/${uploadFor.id}-${Date.now()}-${file.name}`.replace(/\s+/g, "_");
      const up = await supabase.storage.from("learning-proofs").upload(path, file, { upsert: true });
      if (up.error) throw up.error;
      const existing = subByCourse.get(uploadFor.id);
      if (existing) {
        const { error } = await supabase
          .from("course_submissions")
          .update({ screenshot_path: path, status: "submitted", rejection_note: null, submitted_at: new Date().toISOString(), reviewed_at: null, reviewed_by: null })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("course_submissions")
          .insert({ course_id: uploadFor.id, user_id: me.id, screenshot_path: path });
        if (error) throw error;
      }
      toast.success("Submitted for review");
      setUploadFor(null);
      setFile(null);
      qc.invalidateQueries({ queryKey: ["my-submissions", me.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Learning</h1>
          <p className="text-sm text-muted-foreground">Courses assigned to you — upload a screenshot when you're done.</p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your courses</CardTitle>
          <CardDescription>Upcoming, due, awaiting review, completed, and missed all live here.</CardDescription>
        </CardHeader>
        <CardContent>
          {grouped.length === 0 && <p className="text-sm text-muted-foreground">No courses assigned yet.</p>}
          <div className="space-y-2">
            {grouped.map(({ course, sub, status }) => {
              const canSubmit = status === "due" || status === "awaiting";
              return (
                <div key={course.id} className="border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{course.title}</span>
                      <StatusBadge status={status} />
                    </div>
                    {course.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{course.description}</p>}
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span>Due {format(parseISO(course.due_date), "d MMM yyyy")}</span>
                      {course.resource_url && (
                        <a href={course.resource_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline text-primary">
                          <ExternalLink className="h-3 w-3" /> Open resource
                        </a>
                      )}
                    </div>
                    {sub?.status === "rejected" && sub.rejection_note && (
                      <div className="text-xs text-red-600 mt-1">Rejected: {sub.rejection_note}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {canSubmit && (
                      <Button size="sm" variant="outline" onClick={() => { setUploadFor(course); setFile(null); }}>
                        <Upload className="h-3.5 w-3.5 mr-1" />
                        {sub ? "Resubmit" : "Submit proof"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!uploadFor} onOpenChange={(o) => { if (!o) { setUploadFor(null); setFile(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit proof — {uploadFor?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Screenshot (image or PDF)</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">A Learning Admin will review and approve or reject.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadFor(null); setFile(null); }}>Cancel</Button>
            <Button disabled={!file || busy} onClick={submitProof}>{busy ? "Uploading…" : "Submit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
