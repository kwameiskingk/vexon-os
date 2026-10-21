import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./Panel";

export interface TimelineItem {
  id: string;
  /** Mono gutter text: "10:00" or "21 Oct". */
  time: string;
  primary: ReactNode;
  secondary?: ReactNode;
  /** Right-hand slot: pills or actions. */
  aside?: ReactNode;
  /** The gradient dot: the one that needs the reader. */
  focus?: boolean;
  onClick?: () => void;
}

export interface TimelineGroup {
  /** Eyebrow, e.g. "Fri" with `day` = "16 Oct". */
  label: string;
  day?: string;
  items: TimelineItem[];
}

/** Time gutter with a thread and a dot per row. Groups get a mono eyebrow. */
export function Timeline({ groups, empty, className }: { groups: TimelineGroup[]; empty?: ReactNode; className?: string }) {
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  if (total === 0) return <div className="py-[26px] text-center text-[12px] text-[var(--dim)]">{empty ?? "Nothing here."}</div>;
  return (
    <div className={className}>
      {groups.map((g, gi) => (
        <div key={g.label + gi}>
          {g.label && (
            <Eyebrow className="pb-1 pl-[14px] pt-[10px]">
              {g.label}
              {g.day && <b className="ml-[6px] font-medium text-[var(--ink2)]">{g.day}</b>}
            </Eyebrow>
          )}
          {g.items.map((it, i) => (
            <div
              key={it.id}
              role={it.onClick ? "button" : undefined}
              tabIndex={it.onClick ? 0 : undefined}
              onClick={it.onClick}
              onKeyDown={it.onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); it.onClick?.(); } } : undefined}
              className={cn(
                "group relative grid grid-cols-[56px_1fr_auto] items-center gap-3 border-b border-[var(--line)] py-[11px] transition-colors duration-150 last:border-b-0",
                it.onClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
              )}
            >
              {/* thread */}
              <span aria-hidden className={cn("absolute left-[2.5px] w-px bg-[var(--line)]", i === 0 ? "top-1/2" : "top-0", i === g.items.length - 1 ? "bottom-1/2" : "bottom-0")} />
              <span className="relative pl-[14px] font-mono text-[12px] text-[var(--ink2)]">
                <i aria-hidden className={cn("absolute left-0 top-1/2 h-[6px] w-[6px] -translate-y-1/2 rounded-full", it.focus ? "[background:var(--grad)] shadow-[0_0_0_3px_color-mix(in_srgb,#C488E8_20%,transparent)]" : "bg-[var(--dim2)]")} />
                {it.time}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold transition-colors duration-150 group-hover:text-[var(--accent)]">{it.primary}</div>
                {it.secondary && <div className="truncate text-[11.5px] text-[var(--dim)]">{it.secondary}</div>}
              </div>
              <div className="flex items-center gap-[5px]">{it.aside}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
