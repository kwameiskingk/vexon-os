// Absence-aware pace expectation — "how much should setter X have done by
// now?" for a resolved target, given the team pace curve and the setter's
// OWN attendance. The attendance basis is the SAME single definition the
// setter review uses (attendanceDayValue in setterMetrics.ts): present/late
// = 1, half_day = 0.5, absent/unmarked = 0. NEVER calendar days.
//
// Grain rules (locked in the Phase-2 spec):
// - DAILY metrics (booked/talk/dials) accrue per worked day:
//     expected-to-date = daily_target × Σ worked-fraction(day ≤ asOf)
//   The curve shape does not reshape daily metrics — applying weekday weights
//   on top of per-day accrual would double-count absence.
// - WEEKLY metrics (sat) spread across the weekday SHAPE, absence-adjusted:
//     expected-to-date = weekly_target × Σ (weight(day)/100 × worked-fraction(day ≤ asOf))
//   Missing Monday reduces the week's expectation by Monday's weight — the
//   expectation REDUCES for unworked days, it never redistributes to others.
// - A 'no_target' metric is not paced: expected is null everywhere.
// - Month grain: no RAG metric uses it yet; deliberately unpaced (null) until
//   a month-shape curve row is designed.
//
// A day not yet marked in attendance contributes 0 expectation (the review's
// no-calendar-fallback rule). Practical effect mid-day: until Nadia marks
// today, today adds nothing to "expected by now" — the RAG runs lenient for
// a few hours, never punitive.

import { supabase } from "@/integrations/supabase/client";
import { attendanceDayValue } from "@/lib/metrics/setterMetrics";
import type { ResolvedTarget } from "./resolveTargets";

export type WeekWeights = {
  mon: number;
  tue: number;
  wed: number;
  thu: number;
  fri: number;
};

/** Starting shape (even spread). Nadia's edited curve in pace_curves wins. */
export const DEFAULT_WEEK_WEIGHTS: WeekWeights = {
  mon: 20,
  tue: 20,
  wed: 20,
  thu: 20,
  fri: 20,
};

const WEEKDAY_KEYS: Array<keyof WeekWeights | null> = [
  null, // sunday — outside the shape, weight 0
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  null, // saturday
];

/** Curve weight (0-100) for a yyyy-mm-dd day. Weekends carry no expectation. */
export function weightForDay(dayKey: string, weights: WeekWeights): number {
  const key = WEEKDAY_KEYS[new Date(`${dayKey}T00:00:00`).getDay()];
  return key ? Number(weights[key]) || 0 : 0;
}

export function weightsAreValid(weights: WeekWeights): boolean {
  const values = [weights.mon, weights.tue, weights.wed, weights.thu, weights.fri];
  if (values.some((v) => typeof v !== "number" || Number.isNaN(v) || v < 0)) return false;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.abs(sum - 100) < 0.001;
}

/** The team curve for a department; DEFAULT_WEEK_WEIGHTS when unset/invalid
 *  (and pre-migration, where the read errors and degrades to the default). */
export async function fetchPaceCurve(department: string): Promise<WeekWeights> {
  const { data, error } = await supabase
    .from("pace_curves")
    .select("weights")
    .eq("department", department)
    .eq("period", "week")
    .maybeSingle();
  if (error || !data) return DEFAULT_WEEK_WEIGHTS;
  const w = data.weights as unknown as WeekWeights;
  return weightsAreValid(w) ? w : DEFAULT_WEEK_WEIGHTS;
}

export interface AttendanceDay {
  /** yyyy-mm-dd */
  date: string;
  status: string;
}

export interface PaceExpectation {
  /** Expected-to-date amount; null when the metric is no_target or unpaced. */
  expected: number | null;
  /** Fractional worked days elapsed (the review's attendance basis). */
  workedDays: number;
  /** Absence-adjusted curve percentage applied (weekly-grain metrics). */
  curvePctApplied: number;
}

/**
 * Expected-to-date for one resolved target. `attendanceRows` must already be
 * scoped to the period (e.g. this week's rows for the setter) — rows dated
 * after `asOf` are ignored so an in-progress period is handled naturally.
 */
// ---------------------------------------------------------------------------
// Intraday pacing for DAILY metrics — 2026-07-30, requested independently by
// Nadia and Felix. This is a DELIBERATE reversal of the Phase-3 "no intraday
// grace" ruling, for daily metrics (dials, talk) ONLY: a present setter at
// 9am no longer reads red against the full daily target. Weekly metrics
// (booked, sat) keep the day-of-week curve above untouched, including the
// confirmed rule that zero-actual reads Critical from day one.
//
// The company clock is UK time (the acquisition "09:15 UK" cutoff precedent);
// no shared working-day window existed anywhere before these constants.

export const WORKING_DAY_START_HOUR_UK = 9; // 09:00 UK
export const WORKING_DAY_END_HOUR_UK = 17; // 17:00 UK
/** Below this fraction of the working day, daily metrics render the existing
 *  neutral no_target state — "show nothing early, kick in around lunch". */
export const DAILY_GRACE_ELAPSED_FRACTION = 0.4;

/** Fraction of the UK working day elapsed at `now`: 0 before start, 1 after end. */
export function workingDayElapsedFraction(now: Date = new Date()): number {
  const uk = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const hour = uk.getHours() + uk.getMinutes() / 60;
  if (hour <= WORKING_DAY_START_HOUR_UK) return 0;
  if (hour >= WORKING_DAY_END_HOUR_UK) return 1;
  return (
    (hour - WORKING_DAY_START_HOUR_UK) /
    (WORKING_DAY_END_HOUR_UK - WORKING_DAY_START_HOUR_UK)
  );
}

/**
 * COLOUR-basis expected for a DAILY metric. Live day: null during the grace
 * window (renders the existing no_target neutral, excluded from the rollup
 * like any no_target metric), then daily_target × elapsed-fraction; the full
 * target once the working day ends — no grace at end of day. Non-live days
 * (the board's date picker): the full daily target, as before.
 * Display is UNCHANGED everywhere: cards always show the full daily target
 * (the locked 22-July rule) — this value feeds the colour only.
 */
export function intradayDailyExpected(
  dailyTarget: number,
  isLiveToday: boolean,
  now: Date = new Date(),
): number | null {
  if (!isLiveToday) return dailyTarget;
  const elapsed = workingDayElapsedFraction(now);
  if (elapsed >= 1) return dailyTarget;
  if (elapsed < DAILY_GRACE_ELAPSED_FRACTION) return null;
  return dailyTarget * elapsed;
}

export function computeExpectedToDate(
  target: ResolvedTarget,
  weights: WeekWeights,
  attendanceRows: AttendanceDay[],
  asOf: string,
): PaceExpectation {
  const elapsed = attendanceRows.filter((r) => r.date <= asOf);
  const workedDays = elapsed.reduce((s, r) => s + attendanceDayValue(r.status), 0);
  const curvePctApplied = elapsed.reduce(
    (s, r) => s + weightForDay(r.date, weights) * attendanceDayValue(r.status),
    0,
  );

  if (target.kind === "no_target") {
    return { expected: null, workedDays, curvePctApplied };
  }
  if (target.period === "day") {
    return { expected: target.value * workedDays, workedDays, curvePctApplied };
  }
  if (target.period === "week") {
    return {
      expected: target.value * (curvePctApplied / 100),
      workedDays,
      curvePctApplied,
    };
  }
  // month grain: deliberately unpaced until a month-shape curve exists.
  return { expected: null, workedDays, curvePctApplied };
}
