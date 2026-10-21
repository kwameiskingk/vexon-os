import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Health = "ok" | "warn" | "bad" | "none";

const EDGE: Record<Health, string> = {
  ok: "shadow-[inset_3px_0_0_var(--ok)]",
  warn: "shadow-[inset_3px_0_0_var(--warn)]",
  bad: "shadow-[inset_3px_0_0_var(--bad)]",
  none: "shadow-[inset_3px_0_0_var(--surf3)]",
};

/**
 * Hairline-divided rows. Pass `columns` as a CSS grid-template-columns string
 * so every row and the head line up. `health` paints the 3px left edge.
 */
export function RowList({ columns, head, children, className }: { columns: string; head?: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn("w-full", className)} role="table" style={{ ["--cols" as string]: columns }}>
      {head && (
        <div className="grid items-center gap-3 border-b border-[var(--line)] px-[14px] pb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]" style={{ gridTemplateColumns: "var(--cols)" }} role="row">
          {head.map((h, i) => <span key={i} role="columnheader">{h}</span>)}
        </div>
      )}
      {children}
    </div>
  );
}

export function Row({ health, focus = false, className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { health?: Health; focus?: boolean }) {
  return (
    <div
      role="row"
      className={cn(
        "group grid items-center gap-3 border-b border-[var(--line)] px-[14px] py-3 transition-colors duration-150 last:border-b-0 [&>.rr-num:first-child]:pr-0 [&>.rr-num:first-child]:text-left",
        health && EDGE[health],
        focus && "[&_.row-primary]:text-[var(--accent)]",
        rest.onClick && "cursor-pointer",
        className,
      )}
      style={{ gridTemplateColumns: "var(--cols)" }}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Name + secondary line, used as the first cell of most rows. */
export function RowName({ primary, secondary, lead }: { primary: ReactNode; secondary?: ReactNode; lead?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-[10px]">
      {lead}
      <div className="min-w-0">
        <div className="row-primary truncate text-[13px] font-semibold transition-colors duration-150 group-hover:text-[var(--accent)]">{primary}</div>
        {secondary && <div className="truncate text-[11.5px] text-[var(--dim)]">{secondary}</div>}
      </div>
    </div>
  );
}

/** Mono number cell. Right-aligned in a value column; when it is the first
 * cell of a row (a date/time gutter) it sits left under its column head
 * and never wraps (the owner, 15 Oct: the gutter looked disorganised). */
export function RowNum({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rr-num whitespace-nowrap pr-4 text-right font-mono text-[12.5px] font-medium", className)}>{children}</div>;
}

/** Health label with dot (for rows that do not use the edge). */
export function HealthLabel({ health, children }: { health: Health; children: ReactNode }) {
  const dot = { ok: "bg-[var(--ok)]", warn: "bg-[var(--warn)]", bad: "bg-[var(--bad)]", none: "bg-[var(--dim2)]" }[health];
  return (
    <div className="flex items-center gap-[7px] text-[12.5px]">
      <i className={cn("h-[6px] w-[6px] rounded-full", dot)} />
      {children}
    </div>
  );
}
