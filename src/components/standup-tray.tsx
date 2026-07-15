import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClipboardList, Check } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { listMyStandupFlags, resolveStandupFlag } from "@/lib/standup-flags.functions";

export function StandupTray() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyStandupFlags);
  const resolveFn = useServerFn(resolveStandupFlag);

  const { data: items } = useQuery({
    queryKey: ["standup-flags", "mine"],
    queryFn: () => listFn({}),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const count = items?.length ?? 0;

  async function markDiscussed(id: string) {
    try {
      await resolveFn({ data: { id } });
      toast.success("Marked as discussed");
      qc.invalidateQueries({ queryKey: ["standup-flags", "mine"] });
      qc.invalidateQueries({ queryKey: ["standup-flag"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Stand-up agenda">
          <ClipboardList className="h-4 w-4" />
          {count > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px]" variant="destructive">
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <div className="font-medium text-sm">Stand-up agenda</div>
            {count > 0 && (
              <span className="text-xs text-muted-foreground">{count} to discuss today</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Tasks you've flagged to discuss. Oldest first. Only visible to you.
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {count === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No items flagged. Use the "Discuss in stand-up" button on a task to add one.
            </div>
          ) : (
            (items ?? []).map((f) => (
              <div key={f.id} className="p-3 border-b last:border-b-0 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{f.task?.title ?? "Task"}</div>
                    <div className="text-xs text-muted-foreground">
                      with {f.task?.assignee?.full_name ?? f.task?.assignee?.email ?? "unassigned"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs shrink-0"
                    onClick={() => markDiscussed(f.id)}
                  >
                    <Check className="h-3 w-3" /> Mark discussed
                  </Button>
                </div>
                {f.note && (
                  <div className="text-xs italic text-muted-foreground border-l-2 pl-2">"{f.note}"</div>
                )}
                <div className="text-[10px] text-muted-foreground">
                  flagged {format(new Date(f.created_at), "MMM d, h:mm a")} · {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
