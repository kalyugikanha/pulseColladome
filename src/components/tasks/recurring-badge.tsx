import { Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type RecurringLike = {
  is_recurring_template?: boolean | null;
  recurrence_freq?: string | null;
  recurrence_days?: number[] | null;
  recurrence_parent_id?: string | null;
};

export function isRecurringTask(t: RecurringLike | null | undefined): boolean {
  if (!t) return false;
  if (t.is_recurring_template) return true;
  if (t.recurrence_parent_id) return true;
  if (t.recurrence_freq && t.recurrence_freq !== "none") return true;
  return false;
}

export function RecurringBadge({
  task,
  className,
}: {
  task: RecurringLike | null | undefined;
  className?: string;
}) {
  if (!isRecurringTask(task)) return null;
  const label = task?.is_recurring_template ? "Recurring template" : "Recurring";
  return (
    <Badge
      variant="secondary"
      className={`text-[10px] gap-1 ${className ?? ""}`}
      title={label}
    >
      <Repeat className="h-3 w-3" />
      Recurring
    </Badge>
  );
}
