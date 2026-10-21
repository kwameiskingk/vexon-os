import { memo } from "react";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";
import { cn } from "@/lib/utils";

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  delay?: number;
  decimals?: number;
  className?: string;
}

export const AnimatedCounter = memo(({
  value,
  prefix = "",
  suffix = "",
  duration = 1100,
  delay = 0,
  decimals = 0,
  className,
}: AnimatedCounterProps) => {
  const animatedValue = useAnimatedCounter(value, { duration, delay, decimals });

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}{animatedValue.toLocaleString()}{suffix}
    </span>
  );
});

AnimatedCounter.displayName = "AnimatedCounter";
