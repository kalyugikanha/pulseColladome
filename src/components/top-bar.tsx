import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useViewAs } from "@/hooks/use-view-as";
import { useHolidays, nextHoliday } from "@/hooks/use-holidays";
import { CalendarClock, Eye } from "lucide-react";
import { differenceInCalendarDays, format } from "date-fns";

export function TopBar({ realUserId, isSuperAdmin, viewingAs }: { realUserId: string; isSuperAdmin: boolean; viewingAs: boolean }) {
  const { viewAsUserId, setViewAsUserId } = useViewAs();
  const { data: holidays } = useHolidays();
  const nh = nextHoliday(holidays);

  const { data: profiles } = useQuery({
    queryKey: ["viewas-profiles"],
    enabled: isSuperAdmin,
    staleTime: 5 * 60_000,
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email").order("full_name")).data ?? [],
  });

  return (
    <div className="flex items-center gap-3 flex-wrap justify-end">
      {nh && (
        <div className="hidden md:flex items-center gap-2 rounded-md border border-border bg-surface/60 px-2.5 py-1 text-xs">
          <CalendarClock className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium">{nh.name}</span>
          <span className="text-muted-foreground">
            {format(new Date(nh.holiday_date), "d MMM")} · in {Math.max(0, differenceInCalendarDays(new Date(nh.holiday_date), new Date()))}d
          </span>
        </div>
      )}
      {isSuperAdmin && (
        <div className="flex items-center gap-2">
          {viewingAs && <Badge variant="outline" className="text-[10px] gap-1"><Eye className="h-3 w-3" />Viewing as</Badge>}
          <Select value={viewAsUserId ?? realUserId} onValueChange={(v) => setViewAsUserId(v === realUserId ? null : v)}>
            <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="View as…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={realUserId}>Myself (default)</SelectItem>
              {(profiles ?? []).filter((p) => p.id !== realUserId).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
        Live
      </div>
    </div>
  );
}
