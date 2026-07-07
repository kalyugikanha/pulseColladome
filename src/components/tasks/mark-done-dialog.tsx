import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type MarkDoneTarget = {
  id: string;
  title: string;
  assigneeId?: string | null;
  creatorId?: string | null;
};

export type MarkDoneRoster = { id: string; full_name: string | null; email: string | null };

export function MarkDoneDialog({
  task,
  onClose,
  onConfirm,
  roster,
  defaultHandoffId,
}: {
  task: MarkDoneTarget | null;
  onClose: () => void;
  onConfirm: (v: { hours: number; note?: string; handoffId?: string | null }) => void;
  roster?: MarkDoneRoster[];
  defaultHandoffId?: string | null;
}) {
  const [hours, setHours] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [handoff, setHandoff] = useState<string>("");

  useEffect(() => {
    setHours("");
    setNote("");
    setHandoff(defaultHandoffId ?? task?.creatorId ?? task?.assigneeId ?? "");
  }, [task, defaultHandoffId]);

  const hoursNum = Number(hours);
  const valid = hours !== "" && !Number.isNaN(hoursNum) && hoursNum > 0;

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Mark done — log actual hours</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">{task?.title}</div>
          <div className="space-y-1">
            <Label>Actual hours spent on this task</Label>
            <Input
              type="number" min={0} step={0.25} value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="e.g. 3.5" autoFocus
            />
          </div>
          {roster && roster.length > 0 && (
            <div className="space-y-1">
              <Label>Hand off to (for approval / next step)</Label>
              <Select value={handoff} onValueChange={setHandoff}>
                <SelectTrigger><SelectValue placeholder="Pick teammate" /></SelectTrigger>
                <SelectContent>
                  {roster.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Note for the reviewer (optional)</Label>
            <Textarea
              rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Anything they should know before approving?"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The task creator reviews these hours. They only land in your timesheet once approved.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gradient-primary" disabled={!valid}
            onClick={() => onConfirm({
              hours: hoursNum,
              note: note || undefined,
              handoffId: handoff || null,
            })}>
            Send for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
