import { memo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ProgressRingProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
  color?: string;
}

export const ProgressRing = memo(({
  value,
  max = 100,
  size = 48,
  strokeWidth = 4,
  className,
  label,
  color,
}: ProgressRingProps) => {
  const [animatedPercent, setAnimatedPercent] = useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setAnimatedPercent(percent);
      return;
    }
    const timeout = setTimeout(() => setAnimatedPercent(percent), 100);
    return () => clearTimeout(timeout);
  }, [percent]);

  const strokeDashoffset = circumference - (animatedPercent / 100) * circumference;
  const strokeColor = color || (percent >= 80 ? "hsl(var(--success))" : percent >= 50 ? "hsl(46, 92%, 58%)" : "hsl(var(--danger))");

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          opacity={0.3}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 800ms cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      </svg>
      {label && (
        <span className="absolute text-xs font-semibold tabular-nums text-foreground">
          {label}
        </span>
      )}
    </div>
  );
});

ProgressRing.displayName = "ProgressRing";
