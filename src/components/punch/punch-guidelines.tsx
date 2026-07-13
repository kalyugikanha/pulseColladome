import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const GUIDELINES = [
  {
    title: "Punch In",
    body: "If you punch in after 10:00 AM, the system will automatically mark it as a Half Day. Please ensure you log in on time to avoid this.",
  },
  {
    title: "Log Hours",
    body: "Make sure to update your daily log hours before the end of the day. If your log hours are not updated, the system will automatically mark it as 1 Full Day Off (Absent).",
  },
];

/** Full inline banner — used on the Attendance page. */
export function PunchGuidelinesBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="font-medium text-foreground">Please make sure to follow the attendance guidelines below:</div>
        <ul className="space-y-1 text-muted-foreground">
          {GUIDELINES.map((g) => (
            <li key={g.title}>
              <span className="font-medium text-foreground">{g.title}:</span> {g.body}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Compact info icon with tooltip — used next to the header punch control. */
export function PunchGuidelinesTooltip() {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Attendance guidelines"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface/60 text-muted-foreground hover:text-foreground hover:bg-accent transition"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="max-w-sm">
          <div className="space-y-1.5 text-xs">
            <div className="font-medium">Please make sure to follow the attendance guidelines below:</div>
            {GUIDELINES.map((g) => (
              <div key={g.title}>
                <span className="font-medium">{g.title}:</span> {g.body}
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
