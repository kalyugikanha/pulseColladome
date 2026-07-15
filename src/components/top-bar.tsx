import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useViewAs } from "@/hooks/use-view-as";
import { useHolidays, nextHoliday } from "@/hooks/use-holidays";
import { CalendarClock, Eye } from "lucide-react";
import { differenceInCalendarDays, format } from "date-fns";
import { NotificationsBell } from "@/components/notifications-bell";
import { QuickPunchControl } from "@/components/punch/quick-punch-control";
import { PunchGuidelinesTooltip } from "@/components/punch/punch-guidelines";
import { StandupTray } from "@/components/standup-tray";



type Row = { id: string; label: string; sub?: string; pending?: boolean };

export function TopBar({ realUserId, isSuperAdmin, viewingAs }: { realUserId: string; isSuperAdmin: boolean; viewingAs: boolean }) {
  const { viewAsUserId, setViewAsUserId } = useViewAs();
  const { data: holidays } = useHolidays();
  const nh = nextHoliday(holidays);

  const { data: profiles } = useQuery({
    queryKey: ["viewas-profiles"],
    enabled: isSuperAdmin,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Super-admin-only RPC that bypasses profiles RLS so the picker shows
      // every teammate regardless of department/role scoping.
      const { data, error } = await supabase.rpc("list_all_profiles_for_super_admin");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null; department: string | null; is_active: boolean | null }>;
    },
  });

  const { data: grants } = useQuery({
    queryKey: ["viewas-grants"],
    enabled: isSuperAdmin,
    staleTime: 5 * 60_000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => ((await (supabase as any).from("role_grants").select("email")).data ?? []) as { email: string }[],
  });

  const rows = useMemo<Row[]>(() => {
    const profileEmails = new Set((profiles ?? []).map((p) => (p.email ?? "").toLowerCase()));
    const activeRows: Row[] = (profiles ?? [])
      .filter((p) => p.id !== realUserId && p.is_active !== false)
      .map((p) => ({
        id: p.id,
        label: p.full_name || p.email || "—",
        sub: p.department ? `${p.department}${p.email ? ` · ${p.email}` : ""}` : (p.email ?? undefined),
      }));
    const pendingRows: Row[] = (grants ?? [])
      .filter((g) => g.email && !profileEmails.has(g.email.toLowerCase()))
      .map((g) => ({ id: `pending:${g.email}`, label: g.email, pending: true }));
    return [...activeRows, ...pendingRows].sort((a, b) => a.label.localeCompare(b.label));
  }, [profiles, grants, realUserId]);


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
          <Select
            value={viewAsUserId ?? realUserId}
            onValueChange={(v) => {
              if (v.startsWith("pending:")) return;
              setViewAsUserId(v === realUserId ? null : v);
            }}
          >
            <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue placeholder="View as…" /></SelectTrigger>
            <SelectContent className="max-h-[360px]">
              <SelectItem value={realUserId}>Myself (default)</SelectItem>
              {rows.map((r) => (
                <SelectItem key={r.id} value={r.id} disabled={r.pending}>
                  <span className="flex items-center gap-2">
                    <span className={r.pending ? "text-muted-foreground" : ""}>{r.label}</span>
                    {r.pending && <span className="text-[9px] rounded border border-border px-1 py-0 text-muted-foreground">Pending signup</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <QuickPunchControl variant="compact" />
        <PunchGuidelinesTooltip />
      </div>
      <NotificationsBell userId={realUserId} />

      <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
        Live
      </div>
    </div>
  );
}
