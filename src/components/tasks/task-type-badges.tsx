import { Badge } from "@/components/ui/badge";
import { BookOpen, Share2 } from "lucide-react";

export type TaskTypeLite = { id: string; name: string; category?: string | null };

const PLATFORM_STYLES: Record<string, string> = {
  instagram: "bg-pink-600 text-white hover:bg-pink-600",
  linkedin: "bg-sky-700 text-white hover:bg-sky-700",
  facebook: "bg-blue-700 text-white hover:bg-blue-700",
  "x (twitter)": "bg-neutral-900 text-white hover:bg-neutral-900",
  twitter: "bg-neutral-900 text-white hover:bg-neutral-900",
  youtube: "bg-red-600 text-white hover:bg-red-600",
  website: "bg-emerald-700 text-white hover:bg-emerald-700",
};

/**
 * Renders a badge for every task type attached to a task.
 * - "Learning" gets a solid indigo pill with a book icon.
 * - Platform-category types (Instagram, LinkedIn, …) get a colored pill with a share icon.
 * - Everything else is a plain secondary badge.
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
        const nameLower = t.name.toLowerCase();
        const isLearning = nameLower === "learning";
        const isPlatform = t.category === "platform";
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
        if (isPlatform) {
          const style = PLATFORM_STYLES[nameLower] ?? "bg-slate-700 text-white hover:bg-slate-700";
          return (
            <Badge key={t.id} className={`gap-1 border-transparent ${text} ${style} ${className}`}>
              <Share2 className="h-3 w-3" />
              {t.name}
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
