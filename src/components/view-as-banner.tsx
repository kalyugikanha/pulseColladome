import { Eye, X } from "lucide-react";
import { useViewAs } from "@/hooks/use-view-as";
import { useCurrentUser } from "@/hooks/use-current-user";

export function ViewAsBanner() {
  const { data: me } = useCurrentUser();
  const { setViewAsUserId } = useViewAs();
  if (!me?.viewingAs) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
        <span className="text-amber-900 dark:text-amber-200 truncate">
          Viewing as <strong>{me.fullName ?? me.email}</strong>. Any changes you make save to their record; audit fields still record your real account.
        </span>
      </div>
      <button
        type="button"
        onClick={() => setViewAsUserId(null)}
        className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-white/60 dark:bg-transparent px-2 py-1 text-[11px] font-medium text-amber-900 dark:text-amber-200 hover:bg-white"
      >
        <X className="h-3 w-3" /> Exit
      </button>
    </div>
  );
}
