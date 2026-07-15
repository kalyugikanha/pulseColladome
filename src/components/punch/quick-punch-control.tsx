import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  punchIn as punchInServerFn,
  type PunchInResult,
  type PunchSessionResult,
} from "@/lib/punch.functions";
import { listStandupFlagsForMeAsAssignee } from "@/lib/standup-flags.functions";
import { STANDUP_MEET_URL } from "@/lib/standup-cutoff";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { toast } from "sonner";
import { LogIn, LogOut } from "lucide-react";
import { PunchOutLogDialog } from "./punch-out-log-dialog";

/**
 * Global, one-click punch control. Renders as either a compact header pill
 * or a hero-sized action button.
 *
 *  - Punch In fires immediately (no navigation, no confirmation).
 *  - Punch Out opens the existing "Log this session" dialog directly.
 *  - Reflects the currently-viewed user (impersonation-aware via useCurrentUser().id).
 */
export function QuickPunchControl({
  variant = "compact",
  className,
}: {
  variant?: "compact" | "hero";
  className?: string;
}) {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const punchInServer = useServerFn(punchInServerFn);
  const [punchingIn, setPunchingIn] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");
  const userId = me?.id;

  const { data: openSession, refetch } = useQuery({
    queryKey: ["quick-punch-session", userId],
    enabled: !!userId,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("punch_sessions")
        .select("*")
        .eq("user_id", userId!)
        .eq("session_date", today)
        .is("punch_out_time", null)
        .order("punch_in_time", { ascending: false })
        .limit(1);
      return ((data ?? [])[0] ?? null) as PunchSessionResult | null;
    },
  });

  const listStandupFn = useServerFn(listStandupFlagsForMeAsAssignee);

  async function handlePunchIn() {
    if (!me || punchingIn || openSession) return;
    setPunchingIn(true);
    try {
      const result = (await punchInServer({ data: { sessionDate: today } })) as PunchInResult;
      toast.success(
        result.status === "already_open" ? "You are already punched in — refreshed." : "Punched in",
      );

      // Stand-up awareness — surface active flags at punch-in time.
      try {
        const flags = await listStandupFn({ data: {} });
        if (flags && flags.length > 0) {
          const flaggers = Array.from(new Set(
            flags.map((f) => f.flagger?.full_name).filter(Boolean) as string[],
          ));
          const withWho = flaggers.length === 0 ? "" :
            flaggers.length === 1 ? ` with ${flaggers[0]}` :
            flaggers.length === 2 ? ` with ${flaggers[0]} and ${flaggers[1]}` :
            ` with ${flaggers[0]}, ${flaggers[1]} +${flaggers.length - 2} more`;
          toast(`You have ${flags.length} item${flags.length === 1 ? "" : "s"} to discuss${withWho} at today's stand-up`, {
            duration: 10000,
            action: { label: "Join Meet", onClick: () => window.open(STANDUP_MEET_URL, "_blank", "noopener,noreferrer") },
          });
        }
      } catch { /* non-fatal */ }

      await Promise.all([
        refetch(),
        qc.invalidateQueries({ queryKey: ["quick-punch-session"] }),
        qc.invalidateQueries({ queryKey: ["punch-sessions-today"] }),
        qc.invalidateQueries({ queryKey: ["punch-history"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["attendance"] }),
        qc.invalidateQueries({ queryKey: ["attendance-overview"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not punch in.");
    } finally {
      setPunchingIn(false);
    }
  }

  if (!me) return null;

  if (variant === "hero") {
    return (
      <>
        {openSession ? (
          <Button
            size="lg"
            onClick={() => setDialogOpen(true)}
            className={`gradient-primary shadow-glow text-base h-12 px-8 ${className ?? ""}`}
          >
            Punch out
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={handlePunchIn}
            disabled={punchingIn}
            className={`gradient-primary shadow-glow text-base h-12 px-8 ${className ?? ""}`}
          >
            {punchingIn ? "Punching in…" : "Punch in"}
          </Button>
        )}
        <PunchOutLogDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          session={openSession ?? null}
          userId={userId ?? ""}
          onCompleted={() => refetch()}
        />
      </>
    );
  }

  // compact: header pill
  return (
    <>
      {openSession ? (
        <Button
          type="button"
          size="sm"
          onClick={() => setDialogOpen(true)}
          className={`h-8 gap-1.5 text-xs bg-success/15 border border-success/40 text-success hover:bg-success/25 hover:text-success ${className ?? ""}`}
          variant="ghost"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Punch out</span>
          <span className="text-[10px] text-success/80 tabular-nums hidden md:inline">
            · since {format(new Date(openSession.punch_in_time), "HH:mm")}
          </span>
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          onClick={handlePunchIn}
          disabled={punchingIn}
          className={`h-8 gap-1.5 text-xs gradient-primary text-primary-foreground shadow-glow ${className ?? ""}`}
        >
          <LogIn className="h-3.5 w-3.5" />
          <span>{punchingIn ? "Punching in…" : "Punch in"}</span>
        </Button>
      )}
      <PunchOutLogDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        session={openSession ?? null}
        userId={userId ?? ""}
        onCompleted={() => refetch()}
      />
    </>
  );
}
