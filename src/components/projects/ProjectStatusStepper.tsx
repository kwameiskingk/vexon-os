import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROJECT_STATUSES, statusIndex, type ProjectStatus } from "./projectStatus";

interface Props {
  status: ProjectStatus;
  onChange?: (status: ProjectStatus) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Five clickable stages. Stages up to and including the current one render
 * filled; later ones hollow. Click any stage to jump there (forwards or back).
 */
export function ProjectStatusStepper({ status, onChange, disabled, className }: Props) {
  const current = statusIndex(status);
  const interactive = !!onChange && !disabled;

  return (
    <ol className={cn("grid grid-cols-5 gap-1 sm:gap-2", className)} aria-label="Project status">
      {PROJECT_STATUSES.map((step, idx) => {
        const reached = idx <= current;
        const isCurrent = idx === current;
        return (
          <li key={step.value} className="min-w-0">
            <button
              type="button"
              disabled={!interactive}
              onClick={() => onChange?.(step.value)}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "group w-full rounded-lg border px-1.5 py-2 sm:px-2.5 sm:py-2.5 text-left transition-all",
                reached ? "border-transparent bg-muted/60" : "border-border/60 bg-card",
                isCurrent && "ring-1 ring-primary/40 bg-card shadow-sm",
                interactive && "hover:border-border hover:bg-muted/40 cursor-pointer",
                !interactive && "cursor-default",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-4 w-4 sm:h-5 sm:w-5 rounded-full inline-flex items-center justify-center shrink-0 transition-colors",
                    reached ? step.dot : "border border-border/80 bg-card",
                  )}
                >
                  {reached && <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-white" strokeWidth={3} />}
                </span>
                <span
                  className={cn(
                    "text-[10.5px] sm:text-[12px] font-medium truncate",
                    isCurrent ? "text-foreground" : reached ? "text-foreground/80" : "text-muted-foreground",
                  )}
                >
                  <span className="sm:hidden">{step.short}</span>
                  <span className="hidden sm:inline">{step.label}</span>
                </span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-border/50 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", reached ? step.dot : "bg-transparent")}
                  style={{ width: reached ? "100%" : "0%" }}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
