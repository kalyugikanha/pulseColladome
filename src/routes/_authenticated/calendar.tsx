import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { addMonths, endOfMonth, format, isWithinInterval, startOfMonth, startOfWeek, endOfWeek, addDays } from "date-fns";
import { ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { useHolidays, weeklyOffLabel } from "@/hooks/use-holidays";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

const TYPE_COLOR: Record<string, string> = {
  casual: "bg-primary/20 text-primary border-primary/40",
  sick: "bg-destructive/20 text-destructive border-destructive/40",
  earned: "bg-success/20 text-success border-success/40",
  unpaid: "bg-muted text-muted-foreground border-border",
};

function CalendarPage() {
  const { data: me } = useCurrentUser();
  const [cursor, setCursor] = useState(new Date());
  const monthStart = startOfMonth(cursor); const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const { data: leaves } = useQuery({
    queryKey: ["team-leave", format(monthStart, "yyyy-MM")],
    queryFn: async () => (await supabase.from("leave_requests").select("id,user_id,leave_type,start_date,end_date,status,user:profiles!leave_requests_user_profile_fkey(full_name)")
      .in("status", me?.isAdmin ? ["approved", "pending"] : ["approved"])
      .lte("start_date", format(gridEnd, "yyyy-MM-dd"))
      .gte("end_date", format(gridStart, "yyyy-MM-dd"))
    ).data ?? [],
  });

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const { data: holidays } = useHolidays();
  const holidayByDate = new Map((holidays ?? []).map((h) => [h.holiday_date, h.name]));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">Team Calendar</h1>
          <p className="text-muted-foreground text-sm mt-1">Who's off, when.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="font-display font-semibold min-w-[140px] text-center">{format(cursor, "MMMM yyyy")}</div>
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(TYPE_COLOR).map(([k, cls]) => (
          <span key={k} className={`inline-flex items-center rounded-md border px-2 py-0.5 capitalize ${cls}`}>{k}</span>
        ))}
        <span className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 text-warning px-2 py-0.5"><PartyPopper className="h-3 w-3" />Holiday</span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 text-muted-foreground px-2 py-0.5">Weekly off</span>
      </div>

      <Card>
        <CardContent className="p-2 md:p-4">
          <div className="grid grid-cols-7 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => <div key={d} className="px-2 py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const dayLeaves = (leaves ?? []).filter((l: any) => isWithinInterval(d, { start: new Date(l.start_date), end: new Date(l.end_date) }));
              const iso = format(d, "yyyy-MM-dd");
              const holiday = holidayByDate.get(iso);
              const offLabel = weeklyOffLabel(d);
              const bg = holiday
                ? "border-warning/50 bg-warning/10"
                : offLabel
                ? "border-border bg-muted/40"
                : "border-border/50";
              return (
                <div key={d.toISOString()} className={`min-h-[90px] rounded-md border p-2 ${bg} ${inMonth ? (holiday || offLabel) ? "" : "bg-surface/40" : "bg-transparent opacity-50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{format(d, "d")}</span>
                    {dayLeaves.length > 0 && <Badge variant="outline" className="h-4 px-1 text-[10px]">{dayLeaves.length}</Badge>}
                  </div>
                  {holiday && (
                    <div className="mb-1 truncate rounded px-1.5 py-0.5 text-[10px] font-semibold border border-warning/40 bg-warning/20 text-warning" title={holiday}>
                      🎉 {holiday}
                    </div>
                  )}
                  {!holiday && offLabel && (
                    <div className="mb-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium border border-border bg-background/40 text-muted-foreground" title={offLabel}>
                      {offLabel}
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {dayLeaves.slice(0, 3).map((l: any) => (
                      <div key={l.id} className={`truncate rounded px-1.5 py-0.5 text-[10px] border ${TYPE_COLOR[l.leave_type]} ${l.status === "pending" ? "opacity-60 border-dashed" : ""}`} title={`${l.user?.full_name ?? "Someone"} · ${l.leave_type}`}>
                        {l.user?.full_name?.split(" ")[0] ?? "—"}
                      </div>
                    ))}
                    {dayLeaves.length > 3 && <div className="text-[10px] text-muted-foreground px-1">+{dayLeaves.length - 3}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
