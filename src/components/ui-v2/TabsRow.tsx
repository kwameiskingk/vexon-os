import { cn } from "@/lib/utils";

/** Text tabs with a 2px gradient underline on the active one. */
export function TabsRow<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn("flex gap-[2px] border-b border-[var(--line)]", className)}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px border-b-2 border-transparent px-[10px] py-[6px] text-[12px] text-[var(--dim)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
              on && "font-semibold text-[var(--ink)] [border-image:var(--grad)_1]",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
