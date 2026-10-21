import { useNavigate } from "react-router-dom";
import { Phone, AlertCircle, Target, TrendingUp, PoundSterling } from "lucide-react";
import { cn } from "@/lib/utils";

interface TodaysFocusProps {
  discoveryCallsToday: number;
  followUpCallsToday: number;
  actionRequired: number;
  overdueOutcomes: number;
  showUpRate: number;
  closeRate: number;
  mtdValue: number;
  isLoading?: boolean;
}

const tileBase = cn(
  "relative overflow-hidden rounded-xl p-4 text-left transition-all duration-200",
  "border border-border/60 bg-card shadow-sm",
  "hover:border-primary/40 hover:shadow-md",
);

const pulseTile = cn(
  "relative overflow-hidden rounded-lg p-3 text-center transition-all duration-200",
  "border border-border/60 bg-muted/30",
  "hover:border-primary/40",
);

export function TodaysFocusPanel({
  discoveryCallsToday,
  followUpCallsToday,
  actionRequired,
  overdueOutcomes,
  showUpRate,
  closeRate,
  mtdValue,
  isLoading,
}: TodaysFocusProps) {
  const navigate = useNavigate();

  const formatCurrency = (value: number) => {
    if (value >= 1000) return `£${(value / 1000).toFixed(1)}k`;
    return `£${value.toLocaleString()}`;
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-muted/40 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted/30 animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative p-6 h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold text-foreground">Today's Focus</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Priority items for today</p>
      </div>

      {/* Top Row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button onClick={() => navigate("/ae/discovery-calls")} className={tileBase}>
          <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary to-primary/40" />
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-md bg-primary/15 ring-1 ring-primary/20">
              <Phone className="h-4 w-4 text-primary" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.1em]">
              Today's Calls
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-foreground">
              {discoveryCallsToday + followUpCallsToday}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {discoveryCallsToday} disc · {followUpCallsToday} follow
            </span>
          </div>
        </button>

        <button onClick={() => navigate("/ae/discovery-calls")} className={tileBase}>
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 w-1",
              actionRequired > 0
                ? "bg-gradient-to-b from-destructive to-destructive/40"
                : "bg-gradient-to-b from-muted-foreground/30 to-transparent",
            )}
          />
          <div className="flex items-center gap-2 mb-2">
            <div
              className={cn(
                "p-1.5 rounded-md ring-1",
                actionRequired > 0
                  ? "bg-destructive/15 ring-destructive/20"
                  : "bg-muted ring-border",
              )}
            >
              <AlertCircle
                className={cn(
                  "h-4 w-4",
                  actionRequired > 0 ? "text-destructive" : "text-muted-foreground",
                )}
              />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.1em]">
              Action Required
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-3xl font-bold tabular-nums",
                actionRequired > 0 ? "text-destructive" : "text-foreground",
              )}
            >
              {actionRequired}
            </span>
            {overdueOutcomes > 0 && (
              <span className="text-[11px] text-muted-foreground">{overdueOutcomes} overdue</span>
            )}
          </div>
        </button>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-3 gap-3 mt-auto">
        <button onClick={() => navigate("/ae/metrics")} className={pulseTile}>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Show-up</span>
          </div>
          <span
            className={cn(
              "text-lg font-bold tabular-nums",
              showUpRate >= 70
                ? "text-emerald-500"
                : showUpRate >= 50
                  ? "text-amber-500"
                  : "text-destructive",
            )}
          >
            {showUpRate}%
          </span>
        </button>

        <button onClick={() => navigate("/ae/metrics")} className={pulseTile}>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Close Rate</span>
          </div>
          <span
            className={cn(
              "text-lg font-bold tabular-nums",
              closeRate >= 30
                ? "text-emerald-500"
                : closeRate >= 15
                  ? "text-amber-500"
                  : "text-foreground",
            )}
          >
            {closeRate}%
          </span>
        </button>

        <button onClick={() => navigate("/ae/metrics")} className={pulseTile}>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <PoundSterling className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">MTD Value</span>
          </div>
          <span className="text-lg font-bold tabular-nums text-emerald-500">
            {formatCurrency(mtdValue)}
          </span>
        </button>
      </div>
    </div>
  );
}
