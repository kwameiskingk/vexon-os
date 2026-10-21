import { memo, useState } from "react";
import { LucideIcon, TrendingUp, TrendingDown, Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";

interface KPICardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: number;
  className?: string;
  tooltip?: string;
  target?: number;
  showProgress?: boolean;
  status?: "success" | "warning" | "danger" | "neutral";
  copyable?: boolean;
  secondaryValue?: number;
  secondaryLabel?: string;
  animationDelay?: number;
  /** Visual weight: primary (hero metric), secondary (default), tertiary (compact) */
  weight?: "primary" | "secondary" | "tertiary";
}

export const KPICard = memo(({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  className = "", 
  tooltip,
  target,
  showProgress = false,
  status,
  copyable = false,
  secondaryValue,
  secondaryLabel,
  animationDelay = 0,
  weight = "secondary",
}: KPICardProps) => {
  const [copied, setCopied] = useState(false);
  const hasTrend = trend !== undefined && trend !== 0;
  const isPositive = trend && trend > 0;
  
  // Parse numeric value for animation
  const isPercentage = typeof value === 'string' && value.includes('%');
  const isTimeWithHours = typeof value === 'string' && /\dh\s*\d+m/.test(value);
  const isTime = typeof value === 'string' && value.includes('m') && !isTimeWithHours;
  const isCurrency = typeof value === 'string' && value.includes('£');
  const numericValue = typeof value === 'number'
    ? value
    : isTimeWithHours
      ? 0
      : parseFloat(String(value).replace(/[^0-9.-]/g, '')) || 0;
  const isNumericOnly = typeof value === 'number';

  const animatedNum = useAnimatedCounter(numericValue, {
    duration: numericValue > 500 ? 900 : 1100,
    delay: animationDelay,
    decimals: isPercentage ? 1 : 0,
  });

  const progressPercent = target && target > 0 ? Math.min((numericValue / target) * 100, 100) : 0;

  const getProgressColor = () => {
    if (target) {
      const percent = (numericValue / target) * 100;
      if (percent >= 100) return "bg-emerald-500";
      if (percent >= 80) return "bg-amber-500";
      return "bg-red-400";
    }
    return "rr-progress-fill";
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(String(value));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Render the display value with animation
  const renderValue = () => {
    if (isNumericOnly) return animatedNum.toLocaleString();
    if (isCurrency) {
      const prefix = value.toString().match(/^[£$€]/)?.[0] || '';
      const suffix = value.toString().match(/[km]$/i)?.[0] || '';
      if (suffix) return `${prefix}${(animatedNum / 1000).toFixed(1)}${suffix}`;
      return `${prefix}${animatedNum.toLocaleString()}`;
    }
    if (isPercentage) return `${animatedNum}%`;
    if (isTimeWithHours) return value;
    if (isTime) return `${animatedNum}m`;
    return value;
  };
  
  const weightStyles = {
    primary: "rr-tile rr-tile-glow bg-dept/[0.05]",
    secondary: "rr-tile",
    tertiary: "",
  };

  const paddingStyles = {
    primary: "p-7",
    secondary: "p-5 sm:p-6",
    tertiary: "p-4",
  };

  const numberStyles = {
    primary: "text-[36px] font-bold",
    secondary: "text-2xl sm:text-[28px] font-semibold",
    tertiary: "text-[22px] font-semibold",
  };
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card 
            variant="metric"
            className={cn(
              "group animate-fade-in",
              weightStyles[weight],
              className
            )}
          >
            {/* Copy button - appears on hover */}
            {copyable && (
              <button
                onClick={handleCopy}
                className="absolute top-3 right-3 p-1.5 rounded-md bg-muted/80 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-muted z-10"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
            )}
            
            <CardContent className={paddingStyles[weight]}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-muted-foreground uppercase tracking-wider font-medium mb-2",
                    weight === "tertiary" ? "text-[10px]" : "text-[11px]"
                  )}>
                    {title}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <h3 className={cn(
                      "font-heading tracking-tight text-foreground tabular-nums",
                      numberStyles[weight]
                    )}>
                      {renderValue()}
                    </h3>
                    {secondaryValue !== undefined && secondaryValue > 0 && (
                      <span className="text-xs font-semibold text-amber-500 tabular-nums">
                        +{secondaryValue} {secondaryLabel || ''}
                      </span>
                    )}
                  </div>
                  {hasTrend && (
                    <div className={cn(
                      "flex items-center gap-1 mt-2 text-xs font-semibold",
                      isPositive ? "text-emerald-400" : "text-red-400"
                    )}>
                      {isPositive ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      <span>{isPositive ? "+" : ""}{trend}%</span>
                    </div>
                  )}
                </div>
                {Icon && (
                  <div className="h-11 w-11 rounded-xl bg-dept/[0.14] flex items-center justify-center group-hover:bg-dept/25 transition-colors duration-200 flex-shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {showProgress && target && target > 0 && (
                <div className="mt-4 pt-3 border-t border-border/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Progress
                    </span>
                    <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {Math.round((numericValue / target) * 100)}% of {target.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full animate-progress-fill",
                        getProgressColor()
                      )}
                      style={{ width: `${progressPercent}%`, transition: "width 800ms cubic-bezier(0.4, 0, 0.2, 1)" }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TooltipTrigger>
        {tooltip && (
          <TooltipContent className="glass-card px-3 py-2">
            <p className="text-sm">{tooltip}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
});

KPICard.displayName = 'KPICard';
