import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Mono, uppercase status pill. Variants map to the semantic tokens. */
export type PillVariant = "default" | "ok" | "warn" | "bad" | "info";

const VARIANT: Record<PillVariant, string> = {
  default: "border-[var(--line2)] text-[var(--ink2)] bg-transparent",
  ok: "border-transparent text-[var(--ok)] bg-[var(--ok-bg)]",
  warn: "border-transparent text-[var(--warn)] bg-[var(--warn-bg)]",
  bad: "border-transparent text-[var(--bad)] bg-[var(--bad-bg)]",
  info: "border-transparent text-[var(--info)] bg-[var(--info-bg)]",
};

export function Pill({ variant = "default", className, ...rest }: HTMLAttributes<HTMLSpanElement> & { variant?: PillVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded border px-[7px] py-[2px] font-mono text-[10px] font-medium uppercase tracking-[0.05em]",
        VARIANT[variant],
        className,
      )}
      {...rest}
    />
  );
}
