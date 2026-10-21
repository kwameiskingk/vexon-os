import { cn } from "@/lib/utils";
import type { MeetingBoardFilter } from "@/hooks/useMeetingBoardUsers";

interface Props {
  activeFilter: MeetingBoardFilter;
  onFilterChange: (filter: MeetingBoardFilter) => void;
}

const FILTERS: { value: MeetingBoardFilter; label: string }[] = [
  { value: 'sales', label: 'Sales' },
  { value: 'fulfillment', label: 'Fulfillment' },
  { value: 'operations', label: 'Operations' },
];

export function MeetingBoardFilterTabs({ activeFilter, onFilterChange }: Props) {
  return (
    <div className="inline-flex items-center rounded-lg bg-muted/40 p-1 gap-0.5">
      {FILTERS.map(f => (
        <button
          key={f.value}
          onClick={() => onFilterChange(f.value)}
          className={cn(
            "px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
            activeFilter === f.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
