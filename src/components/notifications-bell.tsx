import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, CheckCheck, ClipboardList, MessageSquare, AtSign, GitPullRequest } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";

type Notif = {
  id: string;
  kind: string;
  body: string;
  task_id: string | null;
  read_at: string | null;
  created_at: string;
};

function iconFor(kind: string) {
  if (kind === "task_request") return <ClipboardList className="h-3.5 w-3.5 text-primary" />;
  if (kind.startsWith("mention")) return <AtSign className="h-3.5 w-3.5 text-primary" />;
  if (kind.startsWith("stage")) return <GitPullRequest className="h-3.5 w-3.5 text-primary" />;
  return <MessageSquare className="h-3.5 w-3.5 text-primary" />;
}

export function NotificationsBell({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const { data: notifications } = useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, kind, body, task_id, read_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as Notif[];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["notifications", userId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, qc]);

  const unread = (notifications ?? []).filter((n) => !n.read_at);

  async function markRead(n: Notif) {
    if (!n.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      qc.invalidateQueries({ queryKey: ["notifications", userId] });
    }
    if (n.task_id) {
      setOpenTaskId(n.task_id);
    } else if (n.kind === "task_request") {
      navigate({ to: "/tasks" });
    }
    setOpen(false);
  }

  async function markAllRead() {
    const ids = unread.map((n) => n.id);
    if (ids.length === 0) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    qc.invalidateQueries({ queryKey: ["notifications", userId] });
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative h-8 w-8">
            <Bell className="h-4 w-4" />
            {unread.length > 0 && (
              <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] leading-none flex items-center justify-center rounded-full">
                {unread.length > 9 ? "9+" : unread.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="text-sm font-medium">Notifications</div>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={markAllRead} disabled={unread.length === 0}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          </div>
          <ScrollArea className="max-h-96">
            {(notifications ?? []).length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">You're all caught up.</div>
            ) : (
              <div className="divide-y divide-border">
                {(notifications ?? []).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markRead(n)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors ${n.read_at ? "" : "bg-primary/5"}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5">{iconFor(n.kind)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs whitespace-pre-wrap break-words">{n.body}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </div>
                      </div>
                      {!n.read_at && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {openTaskId && <TaskDetailSheet taskId={openTaskId} onClose={(next) => setOpenTaskId(next ?? null)} />}
    </>
  );
}
