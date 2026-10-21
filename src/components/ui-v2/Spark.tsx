import { cn } from "@/lib/utils";

/** Inline bar sparkline, 16px tall, gradient bars. Values are scaled to the max. */
export function Spark({ values, className, label }: { values: number[]; className?: string; label?: string }) {
  const max = Math.max(1, ...values);
  return (
    <span className={cn("inline-flex h-4 items-end gap-[2px]", className)} role="img" aria-label={label ?? `Trend: ${values.join(", ")}`}>
      {values.map((v, i) => (
        <i key={i} className="block w-[3px] rounded-[1px] [background:var(--grad)] opacity-80" style={{ height: `${Math.max(3, (v / max) * 16)}px` }} />
      ))}
    </span>
  );
}
