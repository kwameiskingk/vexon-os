import { useState, useEffect, useRef } from "react";

interface UseAnimatedCounterOptions {
  duration?: number;
  delay?: number;
  decimals?: number;
  easing?: (t: number) => number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function useAnimatedCounter(
  target: number,
  options: UseAnimatedCounterOptions = {}
) {
  const {
    duration = 1100,
    delay = 0,
    decimals = 0,
    easing = easeOutCubic,
  } = options;

  const [value, setValue] = useState(0);
  const rafRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const hasAnimated = useRef(false);

  useEffect(() => {
    // Respect prefers-reduced-motion
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setValue(target);
      return;
    }

    // A target of 0 after the first animation is real data (e.g. a manual
    // override of zero) and must render — but snap to it rather than playing
    // a count-down animation. The old `return` here froze the display at the
    // previous value whenever the new value was exactly 0.
    if (hasAnimated.current && target === 0) {
      setValue(0);
      return;
    }

    const timeout = setTimeout(() => {
      startTimeRef.current = undefined;
      hasAnimated.current = true;

      const animate = (timestamp: number) => {
        if (!startTimeRef.current) startTimeRef.current = timestamp;
        const elapsed = timestamp - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easing(progress);

        setValue(Number((easedProgress * target).toFixed(decimals)));

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          setValue(target);
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay, decimals, easing]);

  return value;
}

export function formatAnimatedValue(value: number, format?: string): string {
  if (format === "currency") {
    if (value >= 1000) return `£${(value / 1000).toFixed(1)}k`;
    return `£${value.toLocaleString()}`;
  }
  if (format === "percent") return `${value}%`;
  if (format === "time") return `${value}m`;
  return value.toLocaleString();
}
