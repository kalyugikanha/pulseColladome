import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import {
  flagTaskForStandup,
  getMyStandupFlagForTask,
  clearMyStandupFlagForTask,
} from "@/lib/standup-flags.functions";

export function StandupFlagButton({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const getFlag = useServerFn(getMyStandupFlagForTask);
  const flagFn = useServerFn(flagTaskForStandup);
  const clearFn = useServerFn(clearMyStandupFlagForTask);

  const { data: flag, refetch } = useQuery({
    queryKey: ["standup-flag", taskId],
    queryFn: () => getFlag({ data: { taskId } }),
  });

  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const isFlagged = !!flag;

  async function save() {
    setBusy(true);
    try {
      await flagFn({ data: { taskId, note } });
      toast.success("Flagged for stand-up");
      setOpen(false);
      setNote("");
      await refetch();
      qc.invalidateQueries({ queryKey: ["standup-flags", "mine"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function clear() {
    setBusy(true);
    try {
      await clearFn({ data: { taskId } });
      toast.success("Cleared stand-up flag");
      setOpen(false);
      await refetch();
      qc.invalidateQueries({ queryKey: ["standup-flags", "mine"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Popover open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o) setNote(flag?.note ?? "");
    }}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={isFlagged ? "default" : "outline"}
          className={isFlagged ? "gap-1" : "gap-1"}
        >
          <Flag className={`h-3.5 w-3.5 ${isFlagged ? "fill-current" : ""}`} />
          {isFlagged ? "Flagged for stand-up" : "Discuss in stand-up"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2" align="end">
        <div className="text-xs font-medium">Note (optional)</div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. ask about blocker on X"
          rows={3}
        />
        <div className="flex justify-between gap-2">
          {isFlagged ? (
            <Button size="sm" variant="ghost" onClick={clear} disabled={busy}>Clear flag</Button>
          ) : <span />}
          <Button size="sm" className="gradient-primary" onClick={save} disabled={busy}>
            {isFlagged ? "Update note" : "Flag for stand-up"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
