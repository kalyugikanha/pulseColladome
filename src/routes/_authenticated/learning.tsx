import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { BookOpen, ExternalLink, Upload, CheckCircle2, Clock3, AlertTriangle, Ban, RotateCcw, Trophy, ChevronDown, ChevronRight } from "lucide-react";

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
  screenshot_path: string | null;
  screenshot_paths: string[] | null;
  learner_comment: string | null;
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
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  function openUpload(course: Course, existing: Submission | undefined) {
    setUploadFor(course);
    setFiles([]);
    setComment(existing?.learner_comment ?? "");
  }

  async function submitProof() {
    if (!me || !uploadFor || files.length === 0) return;
    setBusy(true);
    try {
      const paths: string[] = [];
      for (const f of files) {
        const path = `${me.id}/${uploadFor.id}-${Date.now()}-${f.name}`.replace(/\s+/g, "_");
        const up = await supabase.storage.from("learning-proofs").upload(path, f, { upsert: true });
        if (up.error) throw up.error;
        paths.push(path);
      }
      const existing = subByCourse.get(uploadFor.id);
      if (existing) {
        const { error } = await supabase
          .from("course_submissions")
          .update({
            screenshot_path: paths[0],
            screenshot_paths: paths,
            learner_comment: comment.trim() || null,
            status: "submitted",
            rejection_note: null,
            submitted_at: new Date().toISOString(),
            reviewed_at: null,
            reviewed_by: null,
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("course_submissions")
          .insert({
            course_id: uploadFor.id,
            user_id: me.id,
            screenshot_path: paths[0],
            screenshot_paths: paths,
            learner_comment: comment.trim() || null,
          });
        if (error) throw error;
      }
      toast.success("Submitted for review");
      setUploadFor(null);
      setFiles([]);
      setComment("");
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
                      <Button size="sm" variant="outline" onClick={() => openUpload(course, sub)}>
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

      <LeaderboardCard />


      <Dialog open={!!uploadFor} onOpenChange={(o) => { if (!o) { setUploadFor(null); setFiles([]); setComment(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit proof — {uploadFor?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Screenshots or PDFs (you can select multiple)</Label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
              />
              {files.length > 0 && (
                <p className="text-xs text-muted-foreground">{files.length} file{files.length === 1 ? "" : "s"} selected</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>What did you learn? <span className="text-muted-foreground font-normal">(shown to the reviewer)</span></Label>
              <textarea
                className="w-full min-h-[90px] rounded-md border bg-background p-2 text-sm"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="A couple of sentences on your key takeaways…"
              />
            </div>
            <p className="text-xs text-muted-foreground">A Learning Admin will review and approve or reject.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadFor(null); setFiles([]); setComment(""); }}>Cancel</Button>
            <Button disabled={files.length === 0 || busy} onClick={submitProof}>{busy ? "Uploading…" : "Submit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function fiscalQuarterRange(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth();
  let startM: number;
  if (m >= 6 && m <= 8) startM = 6;
  else if (m >= 9 && m <= 11) startM = 9;
  else if (m >= 0 && m <= 2) startM = 0;
  else startM = 3;
  const start = new Date(y, startM, 1);
  const end = new Date(y, startM + 3, 1);
  const label = `${format(start, "MMM yyyy")} – ${format(new Date(end.getTime() - 1), "MMM yyyy")}`;
  return { start, end, label };
}

function LeaderboardCard() {
  const q = fiscalQuarterRange();
  const { data: rows = [] } = useQuery({
    queryKey: ["learning-leaderboard", q.start.toISOString()],
    queryFn: async () => {
      const { data } = await supabase
        .from("course_submissions")
        .select("user_id, reviewed_at, status")
        .eq("status", "approved")
        .gte("reviewed_at", q.start.toISOString())
        .lt("reviewed_at", q.end.toISOString());
      return (data ?? []) as { user_id: string; reviewed_at: string; status: string }[];
    },
  });
  const { data: people = [] } = useQuery({
    queryKey: ["learning-people-public"],
    queryFn: async () => {
      const { data } = await supabase.rpc("list_assignable_users");
      return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
    },
  });
  const nameOf = (id: string) => {
    const p = people.find((x) => x.id === id);
    return p?.full_name ?? p?.email ?? "Unknown";
  };
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" />Completion leaderboard</CardTitle>
        <CardDescription>Fiscal quarter: {q.label}. Raw count of courses approved in the quarter.</CardDescription>
      </CardHeader>
      <CardContent>
        {counts.length === 0 && <p className="text-sm text-muted-foreground">No completions this quarter yet.</p>}
        <div className="divide-y">
          {counts.map(([uid, n], i) => (
            <div key={uid} className="flex items-center py-2 gap-3">
              <div className="w-8 text-center font-mono text-sm text-muted-foreground">#{i + 1}</div>
              <div className="flex-1 min-w-0 truncate">{nameOf(uid)}</div>
              <Badge variant="outline">{n} completed</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

