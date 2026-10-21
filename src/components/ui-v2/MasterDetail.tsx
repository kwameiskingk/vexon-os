import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Two columns: a 280px list and the selected record. No modal. */
export function MasterDetail({ list, detail, className, listWidth = 280 }: { list: ReactNode; detail: ReactNode; className?: string; listWidth?: number }) {
  return (
    <div className={cn("grid gap-7", className)} style={{ gridTemplateColumns: `${listWidth}px 1fr` }}>
      <div>{list}</div>
      <div className="min-w-0">{detail}</div>
    </div>
  );
}

/** A row in the master list; `selected` gets the gradient left bar. */
export function MasterRow({ selected = false, onClick, primary, secondary, aside }: { selected?: boolean; onClick?: () => void; primary: ReactNode; secondary?: ReactNode; aside?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "relative grid w-full grid-cols-[1fr_auto] items-center gap-[10px] border-b border-[var(--line)] py-3 text-left transition-colors duration-150 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        selected && "before:absolute before:-left-[14px] before:bottom-[6px] before:top-[6px] before:w-[2px] before:rounded-[2px] before:[background:var(--grad)]",
      )}
    >
      <div className="min-w-0">
        <div className={cn("truncate text-[13px] font-semibold", selected && "text-[var(--accent)]")}>{primary}</div>
        {secondary && <div className="truncate text-[11px] text-[var(--dim)]">{secondary}</div>}
      </div>
      {aside && <div className="text-right font-mono text-[11.5px] text-[var(--ink2)]">{aside}</div>}
    </button>
  );
}

/** Detail header: ringed avatar, name in Bricolage, email, pills, actions right. */
export function DetailHeader({ avatar, name, email, pills, actions }: { avatar: ReactNode; name: ReactNode; email?: ReactNode; pills?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start gap-[14px] pb-[14px]">
      {avatar}
      <div className="min-w-0 flex-1">
        <h3 className="m-0 font-head text-[22px] font-medium tracking-[-0.02em]">{name}</h3>
        {email && <div className="text-[12px] text-[var(--dim)]">{email}</div>}
        {pills && <div className="mt-[6px] flex gap-[5px]">{pills}</div>}
      </div>
      {actions && <div className="flex gap-[6px]">{actions}</div>}
    </div>
  );
}
