import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import { Plus, Pencil, Trash2, ExternalLink, Check, X, Trophy } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/learning-admin")({ component: LearningAdminPage });

type Course = { id: string; title: string; description: string | null; resource_url: string | null; due_date: string };
type Target = { id: string; course_id: string; user_id: string | null; department: string | null };
type Person = { id: string; full_name: string | null; email: string | null; department: string | null };
type Submission = {
  id: string; course_id: string; user_id: string;
  screenshot_path: string | null;
  screenshot_paths: string[] | null;
  learner_comment: string | null;
  status: "submitted" | "approved" | "rejected"; rejection_note: string | null;
  submitted_at: string; reviewed_at: string | null;
};

function fiscalQuarterRange(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth();
  let startY = y, startM: number;
  if (m >= 6 && m <= 8) startM = 6;
  else if (m >= 9 && m <= 11) startM = 9;
  else if (m >= 0 && m <= 2) startM = 0;
  else startM = 3;
  const start = new Date(startY, startM, 1);
  const end = new Date(startY, startM + 3, 1);
  const label = `${format(start, "MMM yyyy")} – ${format(new Date(end.getTime() - 1), "MMM yyyy")}`;
  return { start, end, label };
}

function LearningAdminPage() {
  const { data: me } = useCurrentUser();
  if (me && !me.isLearningAdmin) throw redirect({ to: "/dashboard" });
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Learning Admin</h1>
        <p className="text-sm text-muted-foreground">Courses, review submissions, and completion leaderboard.</p>
      </div>
      <Tabs defaultValue="courses">
        <TabsList>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="review">Review Queue</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
        </TabsList>
        <TabsContent value="courses" className="mt-4"><CoursesTab /></TabsContent>
        <TabsContent value="review" className="mt-4"><ReviewTab /></TabsContent>
        <TabsContent value="leaderboard" className="mt-4"><LeaderboardTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Shared people/department options ----------
function usePeople() {
  return useQuery({
    queryKey: ["learning-people"],
    queryFn: async () => {
      const { data } = await supabase.rpc("list_assignable_users");
      return (data ?? []) as Person[];
    },
  });
}

function useDepartments() {
  return useQuery({
    queryKey: ["learning-departments"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("department");
      const set = new Set<string>();
      for (const r of (data ?? []) as { department: string | null }[]) {
        if (r.department && r.department.trim()) set.add(r.department.trim());
      }
      return Array.from(set).sort();
    },
  });
}

// ---------- Courses tab ----------
function CoursesTab() {
  const qc = useQueryClient();
  const { data: courses = [] } = useQuery({
    queryKey: ["admin-courses"],
    queryFn: async () => (await supabase.from("courses").select("*").order("due_date", { ascending: true })).data as Course[] ?? [],
  });
  const { data: targets = [] } = useQuery({
    queryKey: ["admin-targets"],
    queryFn: async () => (await supabase.from("course_targets").select("*")).data as Target[] ?? [],
  });
  const { data: people = [] } = usePeople();

  const nameOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.full_name ?? p.email ?? "—"] as const));
    return (id: string) => m.get(id) ?? "Unknown";
  }, [people]);

  const targetsByCourse = useMemo(() => {
    const m = new Map<string, Target[]>();
    for (const t of targets) {
      const arr = m.get(t.course_id) ?? [];
      arr.push(t);
      m.set(t.course_id, arr);
    }
    return m;
  }, [targets]);

  const [editing, setEditing] = useState<Course | null>(null);
  const [creating, setCreating] = useState(false);

  async function deleteCourse(c: Course) {
    if (!confirm(`Delete course "${c.title}"? This removes it for all assigned employees.`)) return;
    const { error } = await supabase.from("courses").delete().eq("id", c.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-courses"] });
      qc.invalidateQueries({ queryKey: ["admin-targets"] });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />New course</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {courses.length === 0 && <p className="p-4 text-sm text-muted-foreground">No courses yet.</p>}
            {courses.map((c) => {
              const t = targetsByCourse.get(c.id) ?? [];
              const users = t.filter((x) => x.user_id).map((x) => nameOf(x.user_id!));
              const depts = t.filter((x) => x.department).map((x) => x.department!);
              return (
                <div key={c.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{c.title}</span>
                      <Badge variant="outline">Due {format(parseISO(c.due_date), "d MMM yyyy")}</Badge>
                      {c.resource_url && (
                        <a href={c.resource_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                          <ExternalLink className="h-3 w-3" />resource
                        </a>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {depts.length > 0 && <span>Depts: {depts.join(", ")}</span>}
                      {depts.length > 0 && users.length > 0 && " · "}
                      {users.length > 0 && <span>People: {users.join(", ")}</span>}
                      {depts.length === 0 && users.length === 0 && <span className="text-red-600">No targets — nobody sees this course</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" onClick={() => deleteCourse(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {(creating || editing) && (
        <CourseEditor
          course={editing}
          existingTargets={editing ? (targetsByCourse.get(editing.id) ?? []) : []}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-courses"] });
            qc.invalidateQueries({ queryKey: ["admin-targets"] });
          }}
        />
      )}
    </div>
  );
}

function CourseEditor({ course, existingTargets, onClose, onSaved }: { course: Course | null; existingTargets: Target[]; onClose: () => void; onSaved: () => void }) {
  const { data: people = [] } = usePeople();
  const { data: departments = [] } = useDepartments();

  const [title, setTitle] = useState(course?.title ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [resourceUrl, setResourceUrl] = useState(course?.resource_url ?? "");
  const [dueDate, setDueDate] = useState(course?.due_date ?? format(new Date(), "yyyy-MM-dd"));
  const [selUsers, setSelUsers] = useState<Set<string>>(new Set(existingTargets.filter((t) => t.user_id).map((t) => t.user_id!)));
  const [selDepts, setSelDepts] = useState<Set<string>>(new Set(existingTargets.filter((t) => t.department).map((t) => t.department!)));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelUsers(new Set(existingTargets.filter((t) => t.user_id).map((t) => t.user_id!)));
    setSelDepts(new Set(existingTargets.filter((t) => t.department).map((t) => t.department!)));
  }, [existingTargets]);

  async function save() {
    if (!title.trim()) return toast.error("Title required");
    if (!dueDate) return toast.error("Due date required");
    setBusy(true);
    try {
      let courseId = course?.id;
      const payload = { title: title.trim(), description: description || null, resource_url: resourceUrl || null, due_date: dueDate };
      if (courseId) {
        const { error } = await supabase.from("courses").update(payload).eq("id", courseId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("courses").insert(payload).select("id").maybeSingle();
        if (error) throw error;
        courseId = data!.id;
      }
      // Reconcile targets
      const existingUserIds = new Set(existingTargets.filter((t) => t.user_id).map((t) => t.user_id!));
      const existingDeptIds = new Set(existingTargets.filter((t) => t.department).map((t) => t.department!));

      const usersToAdd = Array.from(selUsers).filter((u) => !existingUserIds.has(u));
      const deptsToAdd = Array.from(selDepts).filter((d) => !existingDeptIds.has(d));
      const targetsToRemove = existingTargets.filter((t) =>
        (t.user_id && !selUsers.has(t.user_id)) || (t.department && !selDepts.has(t.department))
      ).map((t) => t.id);

      if (targetsToRemove.length > 0) {
        const { error } = await supabase.from("course_targets").delete().in("id", targetsToRemove);
        if (error) throw error;
      }
      const inserts = [
        ...usersToAdd.map((u) => ({ course_id: courseId!, user_id: u, department: null })),
        ...deptsToAdd.map((d) => ({ course_id: courseId!, user_id: null, department: d })),
      ];
      if (inserts.length > 0) {
        const { error } = await supabase.from("course_targets").insert(inserts);
        if (error) throw error;
      }
      toast.success(course ? "Updated" : "Created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{course ? "Edit course" : "New course"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label>Resource link (video / doc URL)</Label>
            <Input value={resourceUrl} onChange={(e) => setResourceUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <Label>Target departments</Label>
            <div className="mt-1">
              <MultiSelectFilter
                label="Departments"
                options={departments.map((d) => ({ value: d, label: d }))}
                selected={selDepts}
                onChange={setSelDepts}
                align="start"
              />
            </div>
          </div>
          <div>
            <Label>Target individuals</Label>
            <div className="mt-1">
              <MultiSelectFilter
                label="People"
                options={people.map((p) => ({ value: p.id, label: p.full_name ?? p.email ?? "—", sub: p.department ?? undefined }))}
                selected={selUsers}
                onChange={setSelUsers}
                align="start"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">An employee sees the course if they belong to a targeted department OR are targeted individually.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Review queue ----------
function ReviewTab() {
  const qc = useQueryClient();
  const { data: subs = [] } = useQuery({
    queryKey: ["review-queue"],
    queryFn: async () => (await supabase.from("course_submissions").select("*").eq("status", "submitted").order("submitted_at", { ascending: true })).data as Submission[] ?? [],
  });
  const { data: courses = [] } = useQuery({
    queryKey: ["admin-courses"],
    queryFn: async () => (await supabase.from("courses").select("id,title,description,resource_url,due_date")).data as Course[] ?? [],
  });
  const { data: people = [] } = usePeople();

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c] as const)), [courses]);
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p] as const)), [people]);

  const [preview, setPreview] = useState<{ sub: Submission; urls: { path: string; url: string }[] } | null>(null);
  const [rejecting, setRejecting] = useState<Submission | null>(null);
  const [note, setNote] = useState("");

  function proofPaths(sub: Submission): string[] {
    const arr = sub.screenshot_paths ?? [];
    if (arr.length > 0) return arr;
    return sub.screenshot_path ? [sub.screenshot_path] : [];
  }

  async function openPreview(sub: Submission) {
    const paths = proofPaths(sub);
    if (paths.length === 0) return toast.error("No proof files attached");
    const results = await Promise.all(paths.map((p) => supabase.storage.from("learning-proofs").createSignedUrl(p, 600)));
    const urls: { path: string; url: string }[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.error || !r.data) return toast.error("Could not open one of the files");
      urls.push({ path: paths[i], url: r.data.signedUrl });
    }
    setPreview({ sub, urls });
  }

  async function approve(sub: Submission) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("course_submissions").update({
      status: "approved", rejection_note: null, reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null,
    }).eq("id", sub.id);
    if (error) return toast.error(error.message);
    toast.success("Approved");
    qc.invalidateQueries({ queryKey: ["review-queue"] });
    qc.invalidateQueries({ queryKey: ["leaderboard"] });
    setPreview(null);
  }

  async function reject() {
    if (!rejecting) return;
    if (!note.trim()) return toast.error("Rejection note required");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("course_submissions").update({
      status: "rejected", rejection_note: note.trim(), reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null,
    }).eq("id", rejecting.id);
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    qc.invalidateQueries({ queryKey: ["review-queue"] });
    setRejecting(null); setNote(""); setPreview(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Awaiting review</CardTitle>
        <CardDescription>{subs.length} submission{subs.length === 1 ? "" : "s"} pending.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {subs.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing pending.</p>}
          {subs.map((s) => {
            const c = courseById.get(s.course_id);
            const p = personById.get(s.user_id);
            const nFiles = proofPaths(s).length;
            return (
              <div key={s.id} className="p-3 flex flex-col sm:flex-row sm:items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c?.title ?? "(deleted course)"}</div>
                  <div className="text-xs text-muted-foreground">
                    {p?.full_name ?? p?.email ?? "Unknown"} · submitted {format(parseISO(s.submitted_at), "d MMM, HH:mm")} · {nFiles} file{nFiles === 1 ? "" : "s"}
                  </div>
                  {s.learner_comment && (
                    <div className="mt-1 text-xs whitespace-pre-wrap rounded border bg-muted/40 p-2">
                      <span className="font-medium">Notes: </span>{s.learner_comment}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => openPreview(s)}>View proof</Button>
                  <Button size="sm" onClick={() => approve(s)}><Check className="h-3.5 w-3.5 mr-1" />Approve</Button>
                  <Button size="sm" variant="destructive" onClick={() => { setRejecting(s); setNote(""); }}><X className="h-3.5 w-3.5 mr-1" />Reject</Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Proof</DialogTitle></DialogHeader>
          {preview?.sub.learner_comment && (
            <div className="text-sm whitespace-pre-wrap rounded border bg-muted/40 p-3">
              <div className="font-medium mb-1">Learner notes</div>
              {preview.sub.learner_comment}
            </div>
          )}
          {preview && (
            <div className="space-y-3 max-h-[70vh] overflow-auto">
              {preview.urls.map(({ path, url }, i) => (
                <div key={path} className="space-y-1">
                  <div className="text-xs text-muted-foreground">File {i + 1} of {preview.urls.length}</div>
                  {path.toLowerCase().endsWith(".pdf")
                    ? <iframe src={url} className="w-full h-[60vh] rounded border" title={`proof-${i}`} />
                    : <img src={url} alt={`proof-${i}`} className="max-h-[60vh] w-auto mx-auto rounded border" />}
                </div>
              ))}
            </div>
          )}
          {preview && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
              <Button variant="destructive" onClick={() => { setRejecting(preview.sub); setNote(""); }}>Reject</Button>
              <Button onClick={() => approve(preview.sub)}>Approve</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) { setRejecting(null); setNote(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject submission</DialogTitle></DialogHeader>
          <div>
            <Label>Note (visible to employee)</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why does this need to be redone?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejecting(null); setNote(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={reject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- Leaderboard ----------
function LeaderboardTab() {
  const q = fiscalQuarterRange();
  const { data: rows = [] } = useQuery({
    queryKey: ["leaderboard", q.start.toISOString()],
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
  const { data: people = [] } = usePeople();
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
        <CardDescription>Fiscal quarter: {q.label}. Raw count of courses approved in the quarter. Read-only — for HR to pick voucher recipients outside Pulse.</CardDescription>
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
