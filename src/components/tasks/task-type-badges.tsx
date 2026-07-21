import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";

export type TaskTypeLite = { id: string; name: string };

/**
 * Renders a badge for every task type attached to a task.
 * The "Learning" type gets a visually distinct solid indigo pill with a book
 * icon so learning assignments pop out against ordinary project tasks.
 */
export function TaskTypeBadges({
  types,
  className = "",
  size = "sm",
}: {
  types: TaskTypeLite[] | null | undefined;
  className?: string;
  size?: "sm" | "xs";
}) {
  if (!types || types.length === 0) return null;
  const text = size === "xs" ? "text-[10px]" : "text-[11px]";
  return (
    <>
      {types.map((t) => {
        const isLearning = t.name.toLowerCase() === "learning";
        if (isLearning) {
          return (
            <Badge
              key={t.id}
              className={`gap-1 ${text} border-transparent bg-indigo-600 text-white hover:bg-indigo-600 dark:bg-indigo-500 ${className}`}
            >
              <BookOpen className="h-3 w-3" />
              Learning
            </Badge>
          );
        }
        return (
          <Badge key={t.id} variant="secondary" className={`${text} ${className}`}>
            {t.name}
          </Badge>
        );
      })}
    </>
  );
}
