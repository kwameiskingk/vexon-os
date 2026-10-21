import { useEffect, useMemo, useState } from "react";
import {
  CEODateRangePicker,
  resolvePreset,
  type CEOPeriodValue,
} from "@/components/ceo/CEODateRangePicker";
import type { CEOSnapshotWindow } from "@/hooks/useCEOSnapshot";
import { todayInLondon } from "@/hooks/useDepartmentHeadGoals";

function defaultValue(): CEOPeriodValue {
  // London business date, not the browser's (matches resolvePreset).
  const today = todayInLondon();
  return {
    preset: "today",
    start: today,
    end: today,
  };
}

function isValid(v: unknown): v is CEOPeriodValue {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const validPresets = new Set(["today", "yesterday", "this_week", "this_month", "custom"]);
  return (
    typeof o.preset === "string" &&
    validPresets.has(o.preset) &&
    typeof o.start === "string" &&
    typeof o.end === "string" &&
    !Number.isNaN(Date.parse(o.start)) &&
    !Number.isNaN(Date.parse(o.end))
  );
}

// Reconstruct a local-day Date from a stored value (yyyy-MM-dd or legacy ISO).
// Avoids UTC round-trip shift so single-day picks query the correct calendar day.
function toLocalStart(s: string): Date {
  return new Date(`${(s || "").slice(0, 10)}T00:00:00`);
}
function toLocalEnd(s: string): Date {
  return new Date(`${(s || "").slice(0, 10)}T23:59:59`);
}

const PERIOD_KEY = "ceo:selected-period";

/**
 * Shared period state + date-range picker used across every CEO sub-tab.
 * Persisted in sessionStorage so navigating between tabs (and refreshes)
 * preserves the choice within a sitting, while every fresh login starts on
 * "Today". Deliberately NOT localStorage: that pinned Marcus to whatever
 * period he last picked, days or weeks later.
 */
export function useCEOPeriod() {
  const [stored, setStored] = useState<CEOPeriodValue>(() => {
    try {
      const raw = sessionStorage.getItem(PERIOD_KEY);
      if (raw !== null) return JSON.parse(raw);
    } catch (error) {
      console.warn(`Failed to read sessionStorage key "${PERIOD_KEY}":`, error);
    }
    return defaultValue();
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(PERIOD_KEY, JSON.stringify(stored));
    } catch (error) {
      console.warn(`Failed to write sessionStorage key "${PERIOD_KEY}":`, error);
    }
  }, [stored]);

  // One-time cleanup of the legacy localStorage copy so no stale period lingers.
  useEffect(() => {
    try {
      localStorage.removeItem(PERIOD_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = isValid(stored) ? stored : defaultValue();

  // For non-custom presets, re-resolve against "now" so e.g. "Today" stays today.
  const window = useMemo<CEOSnapshotWindow>(() => {
    if (value.preset === "custom") {
      return { start: toLocalStart(value.start), end: toLocalEnd(value.end) };
    }
    const r = resolvePreset(value.preset);
    return { start: r.start, end: r.end };
  }, [value.preset, value.start, value.end]);

  const controls = <CEODateRangePicker value={value} onChange={setStored} />;

  return { window, controls };
}
