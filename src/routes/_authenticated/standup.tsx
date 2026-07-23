import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ClipboardList, Check, Flag, Video, Plus, History, Inbox, Users, ExternalLink } from "lucide-react";
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
import {
  getMyStandupSettings,
  saveMyStandupSettings,
  listStandupSettings,
} from "@/lib/standup-settings.functions";
import { useViewAs } from "@/hooks/use-view-as";
import { useCurrentUser } from "@/hooks/use-current-user";


export const Route = createFileRoute("/_authenticated/standup")({
  component: StandupAgendaPage,
  head: () => ({
    meta: [
      { title: "Stand-up agenda · Colladome Pulse" },
      { name: "description", content: "Your active stand-up agenda items and discussion history." },
    ],
  }),
});

function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return format(d, "h:mm a");
}

type TeamSetting = Awaited<ReturnType<typeof listStandupSettings>>[number];

function StandupAgendaPage() {
  const qc = useQueryClient();
  const { viewAsUserId } = useViewAs();
  const listFn = useServerFn(listMyStandupFlags);
  const listForMeFn = useServerFn(listStandupFlagsForMeAsAssignee);
  const createFn = useServerFn(createStandupNote);
  const resolveFn = useServerFn(resolveStandupFlag);
  const getMineFn = useServerFn(getMyStandupSettings);
  const saveMineFn = useServerFn(saveMyStandupSettings);
  const listSettingsFn = useServerFn(listStandupSettings);

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

  const { data: forMeActive } = useQuery({
    queryKey: ["standup-flags", "for-me", "active", viewAsUserId ?? "self"],
    queryFn: () => listForMeFn({ data: { asUserId: viewAsUserId ?? null, resolved: false } }),
    refetchOnWindowFocus: true,
  });

  const { data: forMeHistory } = useQuery({
    queryKey: ["standup-flags", "for-me", "history", viewAsUserId ?? "self"],
    queryFn: () => listForMeFn({ data: { asUserId: viewAsUserId ?? null, resolved: true } }),
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

  const { data: mySettings, refetch: refetchMine } = useQuery({
    queryKey: ["standup-settings", "mine"],
    queryFn: () => getMineFn(),
  });

  const { data: teamSettings } = useQuery({
    queryKey: ["standup-settings", "all"],
    queryFn: () => listSettingsFn({ data: { userIds: null } }),
    staleTime: 60_000,
  });

  // Build lookup of user_id -> settings for inline row hints.
  const relevantIds = useMemo(() => {
    const ids = new Set<string>();
    (active ?? []).forEach((f) => {
      const uid = f.task?.assignee?.id ?? f.tagged?.id ?? null;
      if (uid) ids.add(uid);
    });
    (forMeActive ?? []).forEach((f) => {
      if (f.flagger?.id) ids.add(f.flagger.id);
    });
    return Array.from(ids);
  }, [active, forMeActive]);

  const { data: relevantSettings } = useQuery({
    queryKey: ["standup-settings", "relevant", relevantIds.sort().join(",")],
    enabled: relevantIds.length > 0,
    queryFn: () => listSettingsFn({ data: { userIds: relevantIds } }),
  });

  const settingsByUser = useMemo(() => {
    const map = new Map<string, TeamSetting>();
    (relevantSettings ?? []).forEach((s) => map.set(s.user_id, s));
    (teamSettings ?? []).forEach((s) => { if (!map.has(s.user_id)) map.set(s.user_id, s); });
    return map;
  }, [relevantSettings, teamSettings]);

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
            Track what you've flagged for others and what others have flagged for you. Mark items discussed after stand-up.
          </p>
        </div>
      </div>

      <MyStandupCard
        initial={mySettings ?? null}
        onSave={async (payload) => {
          await saveMineFn({ data: payload });
          await refetchMine();
          qc.invalidateQueries({ queryKey: ["standup-settings"] });
        }}
      />

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

      <Card className="border-primary/30">
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" /> Flagged for you
          </CardTitle>
          {(forMeActive?.length ?? 0) > 0 && (
            <Badge className="text-xs">{forMeActive!.length} pending</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {(forMeActive?.length ?? 0) === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nothing flagged for you. When a teammate flags a task assigned to you (or tags you on a note), it'll appear here until they mark it discussed.
            </div>
          ) : (
            (forMeActive ?? []).map((f) => (
              <ForMeRow key={f.id} f={f} settings={f.flagger?.id ? settingsByUser.get(f.flagger.id) ?? null : null} />
            ))
          )}
          {(forMeHistory?.length ?? 0) > 0 && (
            <details className="pt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Show recently discussed ({Math.min(forMeHistory!.length, 20)})
              </summary>
              <div className="space-y-2 mt-2">
                {forMeHistory!.slice(0, 20).map((f) => (
                  <ForMeRow key={f.id} f={f} settings={f.flagger?.id ? settingsByUser.get(f.flagger.id) ?? null : null} muted />
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" /> Flagged by you
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
            (active ?? []).map((f) => {
              const uid = f.task?.assignee?.id ?? f.tagged?.id ?? null;
              const s = uid ? settingsByUser.get(uid) ?? null : null;
              return (
                <AgendaRow key={f.id} f={f} settings={s} onDiscussed={() => markDiscussed(f.id)} />
              );
            })
          )}
        </CardContent>
      </Card>

      <TeamScheduleCard settings={teamSettings ?? []} />

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

function MyStandupCard({
  initial,
  onSave,
}: {
  initial: { meeting_link: string | null; start_time: string; end_time: string | null } | null;
  onSave: (p: { meetingLink: string | null; startTime: string; endTime: string | null }) => Promise<void>;
}) {
  const [link, setLink] = useState("");
  const [start, setStart] = useState("11:00");
  const [end, setEnd] = useState("12:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLink(initial?.meeting_link ?? "");
    setStart((initial?.start_time ?? "11:00:00").slice(0, 5));
    setEnd((initial?.end_time ?? "12:00:00").slice(0, 5));
  }, [initial]);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        meetingLink: link.trim() || null,
        startTime: start,
        endTime: end || null,
      });
      toast.success("Stand-up settings saved");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Video className="h-4 w-4 text-primary" /> My stand-up
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Your meeting link and time window are visible to teammates so they know when to join your stand-up.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium">Meeting link</label>
            <Input
              className="mt-1"
              placeholder="https://meet.google.com/..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium">Start time</label>
            <Input
              className="mt-1"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium">End time</label>
            <Input
              className="mt-1"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {initial?.meeting_link && (
            <Button asChild variant="outline" size="sm" className="gap-1">
              <a href={initial.meeting_link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Open my link
              </a>
            </Button>
          )}
          <Button size="sm" className="gradient-primary" onClick={save} disabled={saving || !start}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamScheduleCard({ settings }: { settings: TeamSetting[] }) {
  const usable = settings.filter((s) => s.meeting_link || s.start_time);
  if (usable.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4" /> Team stand-up schedule
        </CardTitle>
      </CardHeader>
      <CardContent>
        <details>
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Show all ({usable.length})
          </summary>
          <div className="mt-2 divide-y">
            {usable.map((s) => (
              <div key={s.user_id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {s.profile?.full_name ?? s.profile?.email ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatTime(s.start_time)}{s.end_time ? ` – ${formatTime(s.end_time)}` : ""}
                    {s.profile?.department ? ` · ${s.profile.department}` : ""}
                  </div>
                </div>
                {s.meeting_link ? (
                  <Button asChild size="sm" variant="outline" className="gap-1 shrink-0">
                    <a href={s.meeting_link} target="_blank" rel="noopener noreferrer">
                      <Video className="h-3.5 w-3.5" /> Join
                    </a>
                  </Button>
                ) : (
                  <span className="text-[10px] text-muted-foreground shrink-0">no link set</span>
                )}
              </div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function StandupLink({ settings, label }: { settings: TeamSetting | null; label: string }) {
  if (!settings) {
    return (
      <div className="text-[10px] text-muted-foreground mt-1">
        {label} hasn't set a stand-up time yet.
      </div>
    );
  }
  const window = `${formatTime(settings.start_time)}${settings.end_time ? `–${formatTime(settings.end_time)}` : ""}`;
  return (
    <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
      <span>{label}'s stand-up · {window}</span>
      {settings.meeting_link ? (
        <a
          href={settings.meeting_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <Video className="h-3 w-3" /> Join
        </a>
      ) : (
        <span className="italic">no link set</span>
      )}
    </div>
  );
}

function AgendaRow({
  f,
  settings,
  onDiscussed,
}: {
  f: StandupFlag;
  settings: TeamSetting | null;
  onDiscussed: () => void;
}) {
  const isFreeform = !f.task_id;
  const assignee = f.task?.assignee ?? f.tagged ?? null;
  const assigneeName = assignee?.full_name ?? assignee?.email ?? null;

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
        {assignee && <StandupLink settings={settings} label={assigneeName ?? "Assignee"} />}
      </div>
      <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={onDiscussed}>
        <Check className="h-3.5 w-3.5" /> Mark discussed
      </Button>
    </div>
  );
}

type ForMeFlag = Awaited<ReturnType<typeof listStandupFlagsForMeAsAssignee>>[number];

function ForMeRow({ f, settings, muted }: { f: ForMeFlag; settings: TeamSetting | null; muted?: boolean }) {
  const isFreeform = !f.task_id;
  const flaggerName = f.flagger?.full_name ?? f.flagger?.email ?? "A teammate";
  return (
    <div className={`border rounded-md p-3 ${muted ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">{f.task?.title ?? f.title ?? "Agenda item"}</span>
        {isFreeform && <Badge variant="outline" className="text-[10px]">Free-form</Badge>}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">
        flagged by <span className="font-medium">{flaggerName}</span>
      </div>
      {f.note && (
        <div className="text-xs italic text-muted-foreground border-l-2 pl-2 mt-1.5">"{f.note}"</div>
      )}
      <div className="text-[10px] text-muted-foreground mt-1.5">
        {format(new Date(f.created_at), "MMM d, h:mm a")} · {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
        {f.resolved_at && ` · discussed ${formatDistanceToNow(new Date(f.resolved_at), { addSuffix: true })}`}
      </div>
      <StandupLink settings={settings} label={flaggerName} />
    </div>
  );
}
