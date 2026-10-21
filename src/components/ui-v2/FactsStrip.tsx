import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Tonal strip of eyebrow + value pairs (the Employee Hub facts). */
export function FactsStrip({ facts, className }: { facts: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-4 rounded-[10px] bg-[var(--surf2)] px-4 py-[6px]", className)} style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}>
      {facts.map((f) => (
        <div key={f.label} className="py-[9px]">
          <dt className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--dim)]">{f.label}</dt>
          <dd className="mt-[3px] font-mono text-[12.5px] font-medium text-[var(--ink)]">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
