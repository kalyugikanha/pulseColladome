import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ClipboardList, Check, Flag, Video, Plus, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyStandupFlags,
  listStandupFlagsForMeAsAssignee,
  createStandupNote,
  resolveStandupFlag,
  type StandupFlag,
} from "@/lib/standup-flags.functions";
import { STANDUP_MEET_URL } from "@/lib/standup-cutoff";
import { useViewAs } from "@/hooks/use-view-as";

export const Route = createFileRoute("/_authenticated/standup")({
  component: StandupAgendaPage,
  head: () => ({
    meta: [
      { title: "Stand-up agenda · Colladome Pulse" },
      { name: "description", content: "Your active stand-up agenda items and discussion history." },
    ],
  }),
});

function StandupAgendaPage() {
  const qc = useQueryClient();
  const { viewAsUserId } = useViewAs();
  const listFn = useServerFn(listMyStandupFlags);
  const createFn = useServerFn(createStandupNote);
  const resolveFn = useServerFn(resolveStandupFlag);

  const { data: active } = useQuery({
    queryKey: ["standup-flags", "mine", "active", viewAsUserId ?? "self"],
    queryFn: () => listFn({ data: { asUserId: viewAsUserId ?? null, resolved: false } }),
    refetchOnWindowFocus: true,
  });

  const { data: history } = useQuery({
    queryKey: ["standup-flags", "mine", "history", viewAsUserId ?? "self"],
    queryFn: () => listFn({ data: { asUserId: viewAsUserId ?? null, resolved: true } }),
    staleTime: 60_000,
  });

  const { data: teammates } = useQuery({
    queryKey: ["standup-agenda-teammates"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("list_assignable_users");
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
  });

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [assigneeTag, setAssigneeTag] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  async function addNote() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createFn({
        data: {
          title: title.trim(),
          note: note.trim() || null,
          assigneeTag: assigneeTag === "none" ? null : assigneeTag,
        },
      });
      toast.success("Added to agenda");
      setTitle(""); setNote(""); setAssigneeTag("none");
      qc.invalidateQueries({ queryKey: ["standup-flags"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  async function markDiscussed(id: string) {
    try {
      await resolveFn({ data: { id } });
      toast.success("Marked as discussed");
      qc.invalidateQueries({ queryKey: ["standup-flags"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  const activeCount = active?.length ?? 0;

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-semibold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Stand-up agenda
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Items you've flagged to discuss. Only you see this list. Mark items discussed after stand-up.
          </p>
        </div>
        <Button asChild className="gradient-primary gap-1.5">
          <a href={STANDUP_MEET_URL} target="_blank" rel="noopener noreferrer">
            <Video className="h-4 w-4" /> Join stand-up
          </a>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add a free-form agenda note
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="e.g. Team offsite planning"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="Optional note / context"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={assigneeTag} onValueChange={setAssigneeTag}>
              <SelectTrigger className="w-64 h-9 text-sm">
                <SelectValue placeholder="Tag a teammate (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No one tagged</SelectItem>
                {(teammates ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name ?? t.email ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={addNote} disabled={saving || !title.trim()} className="gradient-primary">
              {saving ? "Adding…" : "Add to agenda"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" /> Active agenda
          </CardTitle>
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeCount} to discuss
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {activeCount === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nothing on your agenda. Flag a task or add a free-form note above.
            </div>
          ) : (
            (active ?? []).map((f) => (
              <AgendaRow key={f.id} f={f} onDiscussed={() => markDiscussed(f.id)} />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
            <History className="h-4 w-4" /> Discussed history
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(history ?? []).length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No discussed items yet.</div>
          ) : (
            (history ?? []).slice(0, 50).map((f) => (
              <div key={f.id} className="border rounded-md p-3 opacity-70">
                <div className="text-sm font-medium">{f.task?.title ?? f.title ?? "Agenda item"}</div>
                {f.note && <div className="text-xs italic text-muted-foreground mt-0.5">"{f.note}"</div>}
                <div className="text-[10px] text-muted-foreground mt-1">
                  flagged {format(new Date(f.created_at), "MMM d, h:mm a")}
                  {f.resolved_at && ` · discussed ${formatDistanceToNow(new Date(f.resolved_at), { addSuffix: true })}`}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AgendaRow({ f, onDiscussed }: { f: StandupFlag; onDiscussed: () => void }) {
  const isFreeform = !f.task_id;
  const assigneeName =
    f.task?.assignee?.full_name ?? f.task?.assignee?.email ??
    f.tagged?.full_name ?? f.tagged?.email ?? null;

  return (
    <div className="border rounded-md p-3 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{f.task?.title ?? f.title ?? "Agenda item"}</span>
          {isFreeform && <Badge variant="outline" className="text-[10px]">Free-form</Badge>}
        </div>
        {assigneeName && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {isFreeform ? "Tagged: " : "Assignee: "}{assigneeName}
          </div>
        )}
        {f.note && (
          <div className="text-xs italic text-muted-foreground border-l-2 pl-2 mt-1.5">"{f.note}"</div>
        )}
        <div className="text-[10px] text-muted-foreground mt-1.5">
          flagged {format(new Date(f.created_at), "MMM d, h:mm a")} · {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
        </div>
      </div>
      <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={onDiscussed}>
        <Check className="h-3.5 w-3.5" /> Mark discussed
      </Button>
    </div>
  );
}
