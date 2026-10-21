import { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KpiBreakdownRow {
  label: string;
  value: string;
}

interface CEOKpiTileProps {
  label: string;
  value: string;
  delta?: { value: string; tone: "up" | "down" | "neutral" } | null;
  expanded?: boolean;
  onToggle?: () => void;
  /** Inline expanded panel content. If provided, tile becomes clickable. */
  details?: {
    rationale?: string;
    rows?: KpiBreakdownRow[];
    sparklinePath?: string; // SVG path data on a 0 0 100 20 viewbox
    extra?: ReactNode;
  };
  highlight?: boolean;
  className?: string;
}

const toneClass = (tone: "up" | "down" | "neutral") =>
  tone === "up"
    ? "text-emerald-600 dark:text-emerald-400"
    : tone === "down"
      ? "text-rose-600 dark:text-rose-400"
      : "text-muted-foreground";

export function CEOKpiTile({
  label,
  value,
  delta,
  expanded,
  onToggle,
  details,
  highlight,
  className,
}: CEOKpiTileProps) {
  const interactive = !!details && !!onToggle;
  const Chevron = interactive ? (expanded ? ChevronDown : ChevronRight) : null;

  return (
    <div
      className={cn(
        "rounded-[8px] bg-[var(--surf2)] overflow-hidden transition-colors",
        highlight && "[box-shadow:inset_3px_0_0_var(--ok)]",
        interactive && "cursor-pointer hover:bg-[var(--sel)]",
        expanded && "bg-[var(--sel)]",
        className,
      )}
      onClick={interactive ? onToggle : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onToggle?.();
        }
      }}
    >
      <div className="p-5">
        <div className="flex justify-between items-start">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--dim)]">
            {label}
          </p>
          {Chevron && (
            <Chevron
              className={cn(
                "w-4 h-4 transition-transform",
                expanded ? "text-primary" : "text-muted-foreground/50",
              )}
            />
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={cn(
              "font-head text-[28px] font-[450] leading-none tracking-[-0.03em] tabular-nums",
              highlight ? "text-emerald-700 dark:text-emerald-300" : "text-foreground",
            )}
          >
            {value}
          </span>
          {delta && (
            <span className={cn("text-xs font-medium", toneClass(delta.tone))}>{delta.value}</span>
          )}
        </div>
      </div>

      {/* Accordion content */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          {details && (
            <div className="px-5 pb-5 pt-4 border-t border-border/40 bg-muted/30 space-y-3">
              {details.rationale && (
                <p className="text-xs text-muted-foreground leading-relaxed">{details.rationale}</p>
              )}
              {details.sparklinePath && (
                <div className="h-10 w-full">
                  <svg viewBox="0 0 100 20" className="w-full h-full" preserveAspectRatio="none">
                    <path
                      d={details.sparklinePath}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
              {details.rows && details.rows.length > 0 && (
                <div className="space-y-1.5">
                  {details.rows.map((r) => (
                    <div key={r.label} className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="font-medium text-foreground">{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
              {details.extra}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SectionEyebrowProps {
  label: string;
  accent: "indigo" | "emerald" | "amber" | "rose";
  trailing?: ReactNode;
}

const accentClass: Record<SectionEyebrowProps["accent"], string> = {
  indigo: "rr-eyebrow-bar",
  emerald: "w-1 h-4 rounded-full bg-emerald-500",
  amber: "w-1 h-4 rounded-full bg-amber-500",
  rose: "w-1 h-4 rounded-full bg-rose-500",
};

export function CEOSectionEyebrow({ label, accent, trailing }: SectionEyebrowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={cn(accentClass[accent])} />
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </h2>
      </div>
      {trailing && (
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
          {trailing}
        </span>
      )}
    </div>
  );
}
