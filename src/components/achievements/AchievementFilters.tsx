import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface AchievementFiltersProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  earnedCount?: number;
  totalCount?: number;
}

const filters = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'earned', label: 'Earned' },
  { key: 'streak', label: 'Streaks' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'quality', label: 'Quality' },
];

export const AchievementFilters = ({
  activeFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  earnedCount = 0,
  totalCount = 0,
}: AchievementFiltersProps) => {
  return (
    <div className="space-y-4">
      {/* Stats summary */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{earnedCount}</span>
          <span> of </span>
          <span className="font-semibold text-foreground">{totalCount}</span>
          <span> achievements earned</span>
        </div>
        <div className="text-sm text-muted-foreground">
          {totalCount > 0 && (
            <span className="font-semibold text-primary">
              {Math.round((earnedCount / totalCount) * 100)}% complete
            </span>
          )}
        </div>
      </div>

      {/* Filter tabs and search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {filters.map(filter => (
            <button
              key={filter.key}
              onClick={() => onFilterChange(filter.key)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200",
                "border border-border hover:border-primary/30",
                activeFilter === filter.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {filter.label}
              {filter.key === 'earned' && earnedCount > 0 && (
                <span className="ml-1.5 text-xs opacity-80">({earnedCount})</span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search achievements..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
    </div>
  );
};
