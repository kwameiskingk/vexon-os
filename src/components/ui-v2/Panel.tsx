import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A section: title row with a 1px rule under it. No border, no background. */
export function Panel({ title, meta, aside, children, className }: { title: ReactNode; meta?: ReactNode; aside?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-center gap-[10px] border-b border-[var(--line)] pb-[10px]">
        <h2 className="m-0 font-head text-[15px] font-medium tracking-[-0.01em]">{title}</h2>
        {meta && <em className="font-body text-[12px] not-italic text-[var(--dim)]">{meta}</em>}
        <span className="flex-1" />
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Mono eyebrow used for day groups and column heads. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]", className)}>{children}</div>;
}
