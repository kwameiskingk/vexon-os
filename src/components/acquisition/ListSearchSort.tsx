import { Search, ArrowUpDown, ArrowUp, ArrowDown, CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SortOption {
  value: string;
  label: string;
}

export interface MonthOption {
  /** YYYY-MM */
  value: string;
  label: string;
}

interface ListSearchSortProps {
  search: string;
  onSearchChange: (v: string) => void;
  sortBy: string;
  onSortByChange: (v: string) => void;
  sortDir: "asc" | "desc";
  onSortDirChange: (d: "asc" | "desc") => void;
  options: SortOption[];
  placeholder?: string;
  /** When true, render Sort trigger as icon-only. */
  iconOnlySort?: boolean;
  /** Optional month filter shown to the left of Sort. */
  monthValue?: string; // "" = all months
  onMonthChange?: (v: string) => void;
  monthOptions?: MonthOption[];
}

export function ListSearchSort({
  search,
  onSearchChange,
  sortBy,
  onSortByChange,
  sortDir,
  onSortDirChange,
  options,
  placeholder = "Search by name, company, email…",
  iconOnlySort = false,
  monthValue,
  onMonthChange,
  monthOptions,
}: ListSearchSortProps) {
  const showMonth = !!onMonthChange && Array.isArray(monthOptions);
  const activeMonthLabel = showMonth
    ? monthOptions!.find((m) => m.value === monthValue)?.label
    : undefined;

  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9 h-9"
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        {showMonth && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0"
                aria-label="Filter by month"
                title={activeMonthLabel ? `Month: ${activeMonthLabel}` : "Filter by month"}
              >
                <CalendarRange className={`h-4 w-4 ${monthValue ? "text-primary" : ""}`} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto">
              <DropdownMenuLabel>Filter by month</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => onMonthChange!("")}
                className={!monthValue ? "bg-accent" : ""}
              >
                All months
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {monthOptions!.map((m) => (
                <DropdownMenuItem
                  key={m.value}
                  onClick={() => onMonthChange!(m.value)}
                  className={monthValue === m.value ? "bg-accent" : ""}
                >
                  {m.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {iconOnlySort ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0"
                aria-label="Sort"
                title={`Sort (${sortDir === "asc" ? "ascending" : "descending"})`}
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowUpDown className="h-4 w-4" />
                Sort
                {sortDir === "asc" ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                )}
              </Button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            {options.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => onSortByChange(opt.value)}
                className={sortBy === opt.value ? "bg-accent" : ""}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Direction</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onSortDirChange("asc")}
              className={sortDir === "asc" ? "bg-accent" : ""}
            >
              <ArrowUp className="h-4 w-4 mr-2" /> Ascending
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onSortDirChange("desc")}
              className={sortDir === "desc" ? "bg-accent" : ""}
            >
              <ArrowDown className="h-4 w-4 mr-2" /> Descending
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function applySearchSort<T>(
  items: T[],
  search: string,
  searchFields: (item: T) => (string | null | undefined)[],
  sortBy: string,
  sortDir: "asc" | "desc",
  sortAccessor: (item: T, key: string) => string | number | Date | null | undefined,
): T[] {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter((it) =>
        searchFields(it)
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : items;

  const sorted = [...filtered].sort((a, b) => {
    const av = sortAccessor(a, sortBy);
    const bv = sortAccessor(b, sortBy);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    let cmp = 0;
    if (av instanceof Date && bv instanceof Date) cmp = av.getTime() - bv.getTime();
    else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  return sorted;
}
