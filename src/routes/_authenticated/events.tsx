import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Calendar, MapPin, MoreHorizontal, Pencil, Plus, Upload, Sparkles, Trash2, FileText, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { extractEventFromSource, type ExtractedEvent } from "@/lib/events.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/events")({
  component: EventsPage,
});

type EventStatus = "upcoming" | "ongoing" | "completed" | "cancelled";
type EventSource = "whatsapp" | "email" | "manual" | "other";

type EventRow = {
  id: string;
  title: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  status: EventStatus;
  source: EventSource;
  source_file_path: string | null;
  source_text: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_LABEL: Record<EventStatus, string> = { upcoming: "Upcoming", ongoing: "Ongoing", completed: "Completed", cancelled: "Cancelled" };
const SOURCE_LABEL: Record<EventSource, string> = { whatsapp: "WhatsApp forward", email: "Email", manual: "Manual entry", other: "Other" };

const STATUS_BADGE: Record<EventStatus, string> = {
  upcoming: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  ongoing: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

function formatDateRange(start: string, end: string | null) {
  const s = new Date(start + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (!end || end === start) return s.toLocaleDateString(undefined, opts);
  const e = new Date(end + "T00:00:00");
  return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(undefined, opts)}`;
}

function isThisWeek(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const dow = start.getDay();
  const weekStart = new Date(start); weekStart.setDate(start.getDate() - dow);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
  return d >= weekStart && d < weekEnd;
}

function EventsPage() {
  const { data: me } = useCurrentUser();
  const canManage = !!(me?.isAdmin || me?.isSuperAdmin || me?.isEventAdmin);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | EventStatus>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);

  const eventsQ = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("events").select("*").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const events = eventsQ.data ?? [];
  const counts = useMemo(() => {
    const c = { all: events.length, upcoming: 0, ongoing: 0, completed: 0, cancelled: 0 };
    events.forEach((e) => { c[e.status]++; });
    return c;
  }, [events]);

  const filtered = filter === "all" ? events : events.filter((e) => e.status === filter);
  const thisWeek = filtered.filter((e) => isThisWeek(e.start_date));
  const earlier = filtered.filter((e) => !isThisWeek(e.start_date));

  const deleteM = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); toast.success("Event deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusM = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: EventStatus }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("events").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); toast.success("Status updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function openSource(path: string | null) {
    if (!path) { toast.info("No source file attached"); return; }
    const { data, error } = await supabase.storage.from("event-sources").createSignedUrl(path, 300);
    if (error || !data) { toast.error("Could not open source"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const chips: Array<{ key: "all" | EventStatus; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "upcoming", label: "Upcoming", count: counts.upcoming },
    { key: "ongoing", label: "Ongoing", count: counts.ongoing },
    { key: "completed", label: "Completed", count: counts.completed },
    { key: "cancelled", label: "Cancelled", count: counts.cancelled },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Events</h1>
          <p className="text-sm text-muted-foreground mt-1">Company events, meetups, and offsites — all in one place.</p>
        </div>
        {canManage && (
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Event
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              filter === c.key ? "bg-primary text-primary-foreground border-primary" : "bg-surface hover:bg-muted border-border text-foreground"
            }`}
          >
            {c.label}
            <span className={`rounded-full px-1.5 text-[10px] ${filter === c.key ? "bg-primary-foreground/20" : "bg-muted"}`}>{c.count}</span>
          </button>
        ))}
      </div>

      {eventsQ.isLoading ? (
        <div className="text-muted-foreground text-sm">Loading events…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Calendar className="h-10 w-10 mx-auto text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No events yet</p>
          <p className="text-xs text-muted-foreground">{canManage ? "Click Add Event to create one." : "Check back soon."}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {thisWeek.length > 0 && (
            <Section title="This week">
              {thisWeek.map((e) => (
                <EventRowCard key={e.id} row={e} canManage={canManage} onEdit={() => { setEditing(e); setDialogOpen(true); }} onDelete={() => deleteM.mutate(e.id)} onStatus={(s) => statusM.mutate({ id: e.id, status: s })} onSource={() => openSource(e.source_file_path)} />
              ))}
            </Section>
          )}
          {earlier.length > 0 && (
            <Section title="Earlier">
              {earlier.map((e) => (
                <EventRowCard key={e.id} row={e} canManage={canManage} onEdit={() => { setEditing(e); setDialogOpen(true); }} onDelete={() => deleteM.mutate(e.id)} onStatus={(s) => statusM.mutate({ id: e.id, status: s })} onSource={() => openSource(e.source_file_path)} />
              ))}
            </Section>
          )}
        </div>
      )}

      {canManage && (
        <EventDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={() => { qc.invalidateQueries({ queryKey: ["events"] }); setDialogOpen(false); }} />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EventRowCard({ row, canManage, onEdit, onDelete, onStatus, onSource }: {
  row: EventRow; canManage: boolean;
  onEdit: () => void; onDelete: () => void;
  onStatus: (s: EventStatus) => void; onSource: () => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface/60 p-3 hover:bg-surface transition">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Calendar className="h-6 w-6" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{row.title}</span>
          <Badge variant="outline" className={STATUS_BADGE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDateRange(row.start_date, row.end_date)}</span>
          {row.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{row.location}</span>}
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"><FileText className="h-3 w-3" />{SOURCE_LABEL[row.source]}</span>
        </div>
      </div>
      {canManage && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              {(["upcoming", "ongoing", "completed", "cancelled"] as EventStatus[]).map((s) => (
                <DropdownMenuItem key={s} onClick={() => onStatus(s)} disabled={s === row.status}>
                  Set status: {STATUS_LABEL[s]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onSource} disabled={!row.source_file_path}>
                <ExternalLink className="mr-2 h-4 w-4" />View source file
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {!canManage && row.source_file_path && (
        <Button variant="ghost" size="icon" onClick={onSource} aria-label="View source"><ExternalLink className="h-4 w-4" /></Button>
      )}
    </div>
  );
}

function EventDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: EventRow | null; onSaved: () => void;
}) {
  const extract = useServerFn(extractEventFromSource);
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<EventStatus>("upcoming");
  const [source, setSource] = useState<EventSource>("manual");
  const [pastedText, setPastedText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [autofilled, setAutofilled] = useState<{ title: boolean; location: boolean; dates: boolean }>({ title: false, location: false, dates: false });
  const [existingPath, setExistingPath] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset when opened
  useMemo(() => {
    if (open) {
      if (editing) {
        setTitle(editing.title); setLocation(editing.location ?? "");
        setStartDate(editing.start_date); setEndDate(editing.end_date ?? "");
        setStatus(editing.status); setSource(editing.source);
        setExistingPath(editing.source_file_path); setPastedText(editing.source_text ?? "");
      } else {
        setTitle(""); setLocation(""); setStartDate(""); setEndDate("");
        setStatus("upcoming"); setSource("manual"); setExistingPath(null); setPastedText("");
      }
      setPendingFile(null);
      setAutofilled({ title: false, location: false, dates: false });
    }
  }, [open, editing]);

  async function runExtract() {
    if (!pendingFile && !pastedText.trim()) { toast.info("Upload a file or paste text first."); return; }
    setExtracting(true);
    try {
      let payload: { text?: string; fileBase64?: string; mimeType?: string } = {};
      if (pastedText.trim()) payload.text = pastedText.trim();
      if (pendingFile) {
        const buf = await pendingFile.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        payload.fileBase64 = btoa(bin);
        payload.mimeType = pendingFile.type || "application/octet-stream";
      }
      const result: ExtractedEvent = await extract({ data: payload });
      if (result.title) { setTitle(result.title); }
      if (result.location) { setLocation(result.location); }
      if (result.startDate) { setStartDate(result.startDate); }
      if (result.endDate) { setEndDate(result.endDate); }
      setAutofilled({ title: !!result.title, location: !!result.location, dates: !!result.startDate });
      toast.success("Details extracted — review and save.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  async function save() {
    if (!title.trim() || !startDate) { toast.error("Title and start date are required."); return; }
    setSaving(true);
    try {
      let filePath = existingPath;
      if (pendingFile) {
        const ext = pendingFile.name.split(".").pop() || "bin";
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("event-sources").upload(path, pendingFile, { upsert: false });
        if (upErr) throw upErr;
        filePath = path;
      }
      const payload = {
        title: title.trim(),
        location: location.trim() || null,
        start_date: startDate,
        end_date: endDate || null,
        status,
        source,
        source_file_path: filePath,
        source_text: pastedText.trim() || null,
      };
      if (editing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("events").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Event updated");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("events").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast.success("Event created");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit event" : "Add event"}</DialogTitle>
        </DialogHeader>

        {!editing && (
          <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">AI extract</div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />{pendingFile ? pendingFile.name : "Upload source file"}
              </Button>
              <input ref={fileRef} type="file" hidden accept="image/*,application/pdf" onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)} />
            </div>
            <Textarea placeholder="…or paste the forwarded message / email text here" rows={3} value={pastedText} onChange={(e) => setPastedText(e.target.value)} />
            <Button type="button" size="sm" onClick={runExtract} disabled={extracting}>
              {extracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Extract details
            </Button>
          </div>
        )}

        <div className="space-y-3">
          <Field label="Event name" autofilled={autofilled.title} onEdit={() => setAutofilled((a) => ({ ...a, title: false }))}>
            <Input value={title} onChange={(e) => { setTitle(e.target.value); setAutofilled((a) => ({ ...a, title: false })); }} />
          </Field>
          <Field label="Location" autofilled={autofilled.location} onEdit={() => setAutofilled((a) => ({ ...a, location: false }))}>
            <Input value={location} onChange={(e) => { setLocation(e.target.value); setAutofilled((a) => ({ ...a, location: false })); }} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" autofilled={autofilled.dates} onEdit={() => setAutofilled((a) => ({ ...a, dates: false }))}>
              <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setAutofilled((a) => ({ ...a, dates: false })); }} />
            </Field>
            <Field label="End date (optional)" autofilled={autofilled.dates} onEdit={() => setAutofilled((a) => ({ ...a, dates: false }))}>
              <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setAutofilled((a) => ({ ...a, dates: false })); }} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EventStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["upcoming", "ongoing", "completed", "cancelled"] as EventStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as EventSource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["manual", "whatsapp", "email", "other"] as EventSource[]).map((s) => (
                    <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {editing && (
            <div className="rounded-md border border-border p-2 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Replace source file (optional)</div>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />{pendingFile ? pendingFile.name : existingPath ? "Replace source file" : "Attach source file"}
              </Button>
              <input ref={fileRef} type="file" hidden accept="image/*,application/pdf" onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save event</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, autofilled, onEdit, children }: { label: string; autofilled: boolean; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5" onFocus={onEdit}>
      <div className="flex items-center gap-2">
        <Label className="text-xs">{label}</Label>
        {autofilled && <Badge variant="outline" className="text-[10px] py-0 h-4 border-primary/40 text-primary">Auto-filled</Badge>}
      </div>
      {children}
    </div>
  );
}
