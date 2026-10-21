import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Search, Users, X, CheckCircle2, CalendarIcon } from "lucide-react";
import { format, subDays } from "date-fns";

export type FeedbackPeriod = "today" | "7d" | "14d" | "30d" | "custom";
export const FEEDBACK_PERIOD_LABEL: Record<FeedbackPeriod, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  custom: "Custom",
};

export const periodToDays = (p: FeedbackPeriod) =>
  p === "today" ? 1 : p === "7d" ? 7 : p === "14d" ? 14 : p === "30d" ? 30 : 1;

export interface FeedbackDateRange {
  from: Date;
  to: Date;
}

/**
 * Get the effective {from,to} dates given the current period + optional custom range.
 * Custom range (when both dates set) takes precedence.
 */
export function getEffectiveRange(
  period: FeedbackPeriod,
  customRange?: { from?: Date; to?: Date }
): FeedbackDateRange {
  if (period === "custom" && customRange?.from && customRange?.to) {
    return { from: customRange.from, to: customRange.to };
  }
  const today = new Date();
  const days = periodToDays(period);
  return { from: subDays(today, days - 1), to: today };
}

/** Format the effective range as YYYY-MM-DD strings for DB queries. */
export function getEffectiveRangeStrings(
  period: FeedbackPeriod,
  customRange?: { from?: Date; to?: Date }
): { start: string; end: string } {
  const { from, to } = getEffectiveRange(period, customRange);
  return { start: format(from, "yyyy-MM-dd"), end: format(to, "yyyy-MM-dd") };
}

export interface FilterUserOption {
  id: string;
  name: string;
  department?: string | null;
  role?: string | null;
}

interface Props {
  /** Show department chips (operations scope only) */
  showDepartment?: boolean;
  /** Show role chips (operations scope only) */
  showRole?: boolean;

  period: FeedbackPeriod;
  onPeriodChange: (p: FeedbackPeriod) => void;

  search: string;
  onSearchChange: (s: string) => void;

  users: FilterUserOption[];
  selectedUserIds: Set<string>;
  onUserToggle: (id: string) => void;
  onUserClear: () => void;

  departments?: string[];
  departmentFilter?: string | null;
  onDepartmentChange?: (d: string | null) => void;

  roles?: string[];
  roleFilter?: string | null;
  onRoleChange?: (r: string | null) => void;

  /** Custom date range (used when period === 'custom') */
  customRange?: { from?: Date; to?: Date };
  onCustomRangeChange?: (r: { from?: Date; to?: Date }) => void;
}

const ROLE_LABELS: Record<string, string> = {
  setter: "Setter",
  sdr_manager: "SDR Manager",
  account_executive: "Account Executive",
  csm: "Client Success",
  ops: "Operations",
  admin: "Admin",
  hr: "HR",
};

export function TeamFeedbackFilters({
  showDepartment,
  showRole,
  period,
  onPeriodChange,
  search,
  onSearchChange,
  users,
  selectedUserIds,
  onUserToggle,
  onUserClear,
  departments = [],
  departmentFilter,
  onDepartmentChange,
  roles = [],
  roleFilter,
  onRoleChange,
  customRange,
  onCustomRangeChange,
}: Props) {
  const visibleUsers = useMemo(() => {
    return users.filter((u) => {
      if (showDepartment && departmentFilter && u.department !== departmentFilter) return false;
      if (showRole && roleFilter && u.role !== roleFilter) return false;
      return true;
    });
  }, [users, departmentFilter, roleFilter, showDepartment, showRole]);

  const hasActive =
    !!search || selectedUserIds.size > 0 || !!departmentFilter || !!roleFilter;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border border-border/50 p-1">
            {(["today", "7d", "14d", "30d"] as FeedbackPeriod[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "ghost"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => onPeriodChange(p)}
              >
                {FEEDBACK_PERIOD_LABEL[p]}
              </Button>
            ))}
          </div>

          {onCustomRangeChange && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={period === "custom" ? "default" : "outline"}
                  size="sm"
                  className="h-9"
                >
                  <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                  {period === "custom" && customRange?.from && customRange?.to
                    ? `${format(customRange.from, "MMM d")} – ${format(customRange.to, "MMM d")}`
                    : "Custom dates"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={
                    customRange?.from
                      ? { from: customRange.from, to: customRange.to }
                      : undefined
                  }
                  onSelect={(range: any) => {
                    onCustomRangeChange({ from: range?.from, to: range?.to });
                    if (range?.from && range?.to) {
                      onPeriodChange("custom");
                    }
                  }}
                  numberOfMonths={2}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
                {period === "custom" && (
                  <div className="p-2 border-t border-border/50 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        onCustomRangeChange({ from: undefined, to: undefined });
                        onPeriodChange("today");
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search…"
              className="pl-8 h-9 w-[200px]"
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                {selectedUserIds.size > 0
                  ? `${selectedUserIds.size} user${selectedUserIds.size > 1 ? "s" : ""}`
                  : "Filter users"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <div className="p-2 border-b border-border/50 flex items-center justify-between">
                <span className="text-xs font-medium">Select users</span>
                {selectedUserIds.size > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onUserClear}>
                    Clear
                  </Button>
                )}
              </div>
              <div className="max-h-[280px] overflow-y-auto p-1">
                {visibleUsers.length === 0 && (
                  <p className="text-xs text-muted-foreground p-3 text-center">No users match current filters</p>
                )}
                {visibleUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => onUserToggle(u.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-muted/50 transition-colors",
                      selectedUserIds.has(u.id) && "bg-primary/10"
                    )}
                  >
                    <div
                      className={cn(
                        "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                        selectedUserIds.has(u.id) ? "bg-primary border-primary" : "border-border"
                      )}
                    >
                      {selectedUserIds.has(u.id) && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span className="truncate">{u.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {hasActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                onSearchChange("");
                onUserClear();
                onDepartmentChange?.(null);
                onRoleChange?.(null);
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {showDepartment && departments.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Department:</span>
          <button
            onClick={() => onDepartmentChange?.(null)}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-medium border transition-all",
              !departmentFilter
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border/50 hover:border-border"
            )}
          >
            All
          </button>
          {departments.map((d) => (
            <button
              key={d}
              onClick={() => onDepartmentChange?.(departmentFilter === d ? null : d)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium border transition-all capitalize",
                departmentFilter === d
                  ? "bg-primary/10 border-primary text-foreground"
                  : "border-border/50 hover:border-border"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {showRole && roles.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Role:</span>
          <button
            onClick={() => onRoleChange?.(null)}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-medium border transition-all",
              !roleFilter
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border/50 hover:border-border"
            )}
          >
            All
          </button>
          {roles.map((r) => (
            <button
              key={r}
              onClick={() => onRoleChange?.(roleFilter === r ? null : r)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium border transition-all",
                roleFilter === r
                  ? "bg-primary/10 border-primary text-foreground"
                  : "border-border/50 hover:border-border"
              )}
            >
              {ROLE_LABELS[r] || r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
