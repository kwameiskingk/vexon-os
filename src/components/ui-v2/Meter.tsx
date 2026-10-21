import { cn } from "@/lib/utils";

/** 6px track with a gradient fill and a mono n/target label. */
export function Meter({ value, target, className, label }: { value: number; target: number; className?: string; label?: string }) {
  const pct = target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : 0;
  return (
    <div className={cn("flex items-center gap-2", className)} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={target} aria-label={label}>
      <div className="h-[6px] flex-1 overflow-hidden rounded-[3px] bg-[var(--surf3)]">
        <i className="block h-full rounded-[3px] [background:var(--grad)]" style={{ width: `${pct}%` }} />
      </div>
      <small className="w-[38px] text-right font-mono text-[11px] text-[var(--dim)]">{value}/{target}</small>
    </div>
  );
}
