import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type OverdueLike = {
  due_date?: string | null;
  status?: string | null;
};

/** Days overdue if due_date is at least 1 full day before today and status is not done. */
export function overdueDays(t: OverdueLike | null | undefined): number {
  if (!t?.due_date) return 0;
  const status = (t.status ?? "").toLowerCase();
  if (status === "done" || status === "completed") return 0;
  const due = new Date(t.due_date);
  if (Number.isNaN(due.getTime())) return 0;
  const dueMid = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((todayMid - dueMid) / 86_400_000);
  return diffDays >= 1 ? diffDays : 0;
}

export function isOverdue(t: OverdueLike | null | undefined): boolean {
  return overdueDays(t) > 0;
}

export function OverdueBadge({
  task,
  className,
}: {
  task: OverdueLike | null | undefined;
  className?: string;
}) {
  const days = overdueDays(task);
  if (days <= 0) return null;
  return (
    <Badge
      variant="destructive"
      className={`text-[10px] gap-1 ${className ?? ""}`}
      title={`Overdue by ${days} day${days === 1 ? "" : "s"}`}
    >
      <AlertTriangle className="h-3 w-3" />
      Overdue · {days}d
    </Badge>
  );
}
