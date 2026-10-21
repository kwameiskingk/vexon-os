import { memo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RefreshCw, Download, Settings, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DashboardToolbarProps {
  title?: string;
  dateLabel?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  onRefresh?: () => void;
  onExport?: () => void;
  onSettings?: () => void;
  isLoading?: boolean;
  periodOptions?: { value: string; label: string }[];
  selectedPeriod?: string;
  onPeriodChange?: (value: string) => void;
  children?: ReactNode;
  className?: string;
}

export const DashboardToolbar = memo(({
  title,
  dateLabel,
  onPrevious,
  onNext,
  onRefresh,
  onExport,
  onSettings,
  isLoading,
  periodOptions,
  selectedPeriod,
  onPeriodChange,
  children,
  className
}: DashboardToolbarProps) => {
  return (
    <div className={cn(
      "flex items-center justify-between gap-4 p-3 rounded-xl",
      "bg-card/50 border border-border/50 backdrop-blur-sm",
      className
    )}>
      {/* Left section - Title & Date Navigation */}
      <div className="flex items-center gap-3">
        {title && (
          <h2 className="text-sm font-heading font-semibold text-foreground">
            {title}
          </h2>
        )}
        
        {(onPrevious || onNext) && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onPrevious}
              disabled={!onPrevious}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {dateLabel && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">
                  {dateLabel}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onNext}
              disabled={!onNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {periodOptions && selectedPeriod && onPeriodChange && (
          <Select value={selectedPeriod} onValueChange={onPeriodChange}>
            <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Center section - Custom children */}
      {children && (
        <div className="flex items-center gap-2">
          {children}
        </div>
      )}

      {/* Right section - Action buttons */}
      <div className="flex items-center gap-1">
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn(
              "h-3.5 w-3.5",
              isLoading && "animate-spin"
            )} />
          </Button>
        )}
        {onExport && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onExport}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        )}
        {onSettings && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onSettings}
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
});

DashboardToolbar.displayName = 'DashboardToolbar';
