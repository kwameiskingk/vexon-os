import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Stat {
  label: string;
  value: ReactNode;
  /** Mono delta, e.g. "+4 this week". */
  delta?: string;
  deltaTone?: "up" | "down" | "flat";
  caption?: ReactNode;
}

/**
 * Two to five stats in a row, separated by hairlines, no boxes.
 * `hero` paints the first numeral with the gradient (one per page at most).
 */
export function StatStrip({ stats, hero = false, className }: { stats: Stat[]; hero?: boolean; className?: string }) {
  return (
    <div className={cn("grid", className)} style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
      {stats.map((s, i) => (
        <div key={s.label} className={cn("pr-[22px]", i > 0 && "border-l border-[var(--line)] pl-[22px]")}>
          <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">{s.label}</span>
          <b
            className={cn(
              "block font-head text-[28px] font-[450] leading-none tracking-[-0.03em]",
              hero && i === 0 && "bg-clip-text text-transparent [background-image:var(--grad)]",
            )}
          >
            {s.value}
          </b>
          {s.delta && (
            <span
              className={cn(
                "mt-[6px] block font-mono text-[10.5px]",
                s.deltaTone === "up" && "text-[var(--ok)]",
                s.deltaTone === "down" && "text-[var(--bad)]",
                (!s.deltaTone || s.deltaTone === "flat") && "text-[var(--dim)]",
              )}
            >
              {s.delta}
            </span>
          )}
          {s.caption && <small className="mt-2 block text-[11.5px] text-[var(--dim)]">{s.caption}</small>}
        </div>
      ))}
    </div>
  );
}
