import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Flag, Video } from "lucide-react";
import { listStandupFlagsForMeAsAssignee } from "@/lib/standup-flags.functions";
import { isBeforeStandupCutoff, STANDUP_MEET_URL } from "@/lib/standup-cutoff";
import { useViewAs } from "@/hooks/use-view-as";

export function StandupAssigneeBanner() {
  const listFn = useServerFn(listStandupFlagsForMeAsAssignee);
  const { viewAsUserId } = useViewAs();
  const { data } = useQuery({
    queryKey: ["standup-flags", "assignee", viewAsUserId ?? "self"],
    queryFn: () => listFn({ data: { asUserId: viewAsUserId ?? null } }),
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });

  const items = (data ?? []).filter((f) => isBeforeStandupCutoff(f.created_at));
  if (items.length === 0) return null;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <Flag className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">
              {items.length === 1
                ? "This task is flagged to discuss in today's stand-up"
                : `${items.length} tasks are flagged to discuss in today's stand-up`}
            </div>
            <ul className="mt-1.5 space-y-1">
              {items.map((f) => (
                <li key={f.id} className="text-sm">
                  <span className="font-medium">{f.task?.title ?? "Task"}</span>
                  {f.note && <span className="text-muted-foreground italic"> — "{f.note}"</span>}
                </li>
              ))}
            </ul>
          </div>
          <Button asChild size="sm" className="gradient-primary gap-1 shrink-0">
            <a href={STANDUP_MEET_URL} target="_blank" rel="noopener noreferrer">
              <Video className="h-3.5 w-3.5" /> Join stand-up
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
