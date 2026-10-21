import { memo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ProgressIndicatorProps {
  value: number;
  target: number;
  label?: string;
  showPercentage?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  animate?: boolean;
}

export const ProgressIndicator = memo(({
  value,
  target,
  label,
  showPercentage = true,
  size = "md",
  className,
  animate = true
}: ProgressIndicatorProps) => {
  const [animatedWidth, setAnimatedWidth] = useState(0);
  const percentage = target > 0 ? Math.min((value / target) * 100, 150) : 0;
  const displayPercentage = target > 0 ? Math.round((value / target) * 100) : 0;

  useEffect(() => {
    if (!animate) {
      setAnimatedWidth(Math.min(percentage, 100));
      return;
    }
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setAnimatedWidth(Math.min(percentage, 100));
      return;
    }
    const timeout = setTimeout(() => setAnimatedWidth(Math.min(percentage, 100)), 100);
    return () => clearTimeout(timeout);
  }, [percentage, animate]);
  
  // Status color based on performance
  const getStatusColor = () => {
    if (displayPercentage >= 100) return "bg-emerald-500";
    if (displayPercentage >= 80) return "bg-amber-500";
    return "bg-red-400";
  };

  const getStatusDot = () => {
    if (displayPercentage >= 100) return "bg-emerald-400";
    if (displayPercentage >= 80) return "bg-amber-400";
    return "bg-red-400";
  };

  const sizeClasses = {
    sm: "h-1",
    md: "h-1.5",
    lg: "h-2"
  };

  return (
    <div className={cn("w-full", className)}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              {label}
            </span>
          )}
          {showPercentage && (
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "inline-block w-1.5 h-1.5 rounded-full",
                getStatusDot()
              )} />
              <span className={cn(
                "text-xs font-semibold tabular-nums",
                displayPercentage >= 100 ? "text-emerald-400" : 
                displayPercentage >= 80 ? "text-amber-400" : "text-red-400"
              )}>
                {displayPercentage}%
              </span>
            </div>
          )}
        </div>
      )}
      <div className={cn(
        "w-full bg-muted/50 rounded-full overflow-hidden",
        sizeClasses[size]
      )}>
        <div
          className={cn(
            "h-full rounded-full transition-all",
            getStatusColor(),
            animate && "duration-700 ease-out"
          )}
          style={{ 
            width: `${animatedWidth}%`,
            transition: animate ? "width 800ms cubic-bezier(0.4, 0, 0.2, 1)" : "none"
          }}
        />
      </div>
      {target > 0 && (
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {value.toLocaleString()}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            Target: {target.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
});

ProgressIndicator.displayName = 'ProgressIndicator';
