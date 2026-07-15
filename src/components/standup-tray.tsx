import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";
import { listMyStandupFlags } from "@/lib/standup-flags.functions";
import { useViewAs } from "@/hooks/use-view-as";

/**
 * Compact top-bar indicator showing the count of active stand-up agenda
 * items for the current user (as flagger). Clicking navigates to the
 * dedicated /standup panel. Acts as the persistent global indicator so
 * unresolved flags are visible from anywhere in the portal.
 */
export function StandupTray() {
  const listFn = useServerFn(listMyStandupFlags);
  const { viewAsUserId } = useViewAs();

  const { data: items } = useQuery({
    queryKey: ["standup-flags", "mine", "active", viewAsUserId ?? "self"],
    queryFn: () => listFn({ data: { asUserId: viewAsUserId ?? null, resolved: false } }),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const count = items?.length ?? 0;

  return (
    <Button asChild variant="ghost" size="icon" className="relative" aria-label="Stand-up agenda">
      <Link to="/standup">
        <ClipboardList className="h-4 w-4" />
        {count > 0 && (
          <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px]" variant="destructive">
            {count}
          </Badge>
        )}
      </Link>
    </Button>
  );
}
