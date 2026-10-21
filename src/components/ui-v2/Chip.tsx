import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Filter chip. Selected = gradient border (padding-box / border-box trick). */
export function Chip({ selected = false, quiet = false, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; quiet?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-transparent px-[9px] py-[4px] font-mono text-[10.5px] tracking-[0.03em] text-[var(--ink2)] transition-colors duration-150 hover:border-[var(--line2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        quiet && "text-[var(--dim)]",
        selected && "border-transparent text-[var(--ink)] [background:linear-gradient(var(--bg),var(--bg))_padding-box,var(--grad)_border-box]",
        className,
      )}
      {...rest}
    />
  );
}
