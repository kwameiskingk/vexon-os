// RAG state engine — pure functions from (actual, expected-to-date) to the
// four locked states, plus the card rollup.
//
// Locked rules (Phase-3 sign-off, 2026-07-22):
// - FOUR states: green (>=75% of expected-to-date) | amber (50-74%) |
//   red (<50%) | no_target (neutral grey "—").
// - A no_target metric (explicit_zero OR unset) is NEVER green, and a metric
//   whose expectation is not yet paceable (expected <= 0, e.g. no attendance
//   marked yet this week) renders the same neutral state.
// - Rollup: worst-of across metrics that HAVE a target; no_target metrics are
//   EXCLUDED (never counted as green). All metrics no_target -> card
//   no_target, which is Nadia's cue to set targets.
// - DIALS DOWN-WEIGHT: dials-red alone can never make the card red — a red
//   card requires booked, sat or talk to be red. Dials red caps at amber.
// - Sat-rate is display-only and never enters the rollup.

import type { TargetMetric } from "./resolveTargets";

export type RagState = "green" | "amber" | "red" | "no_target";

export const RAG_GREEN_MIN_PCT = 75;
export const RAG_AMBER_MIN_PCT = 50;

/** Attainment as % of expected-to-date; null when not paceable. */
export function attainmentPct(actual: number, expected: number | null): number | null {
  if (expected == null || expected <= 0) return null;
  return (actual / expected) * 100;
}

export function metricRagState(actual: number, expected: number | null): RagState {
  const pct = attainmentPct(actual, expected);
  if (pct == null) return "no_target";
  if (pct >= RAG_GREEN_MIN_PCT) return "green";
  if (pct >= RAG_AMBER_MIN_PCT) return "amber";
  return "red";
}

/** The three metrics whose red can make a card red. Dials is deliberately
 *  excluded — Nadia ranked it "nice to have", below the core three. */
const CORE_METRICS: TargetMetric[] = ["booked", "sat", "talk_minutes"];

export function rollupRagState(states: Record<TargetMetric, RagState>): RagState {
  const core = CORE_METRICS.map((m) => states[m]).filter((s) => s !== "no_target");
  const dials = states.dials;
  const considered = [...core, ...(dials !== "no_target" ? [dials] : [])];

  if (considered.length === 0) return "no_target";
  if (core.includes("red")) return "red";
  // Any remaining red can only be dials -> capped at amber.
  if (considered.includes("red") || considered.includes("amber")) return "amber";
  return "green";
}

/** Badge sub-label copy per metric — the ONE place to swap wording when
 *  Nadia settles the naming (2026-07-29 placeholder). */
export const RAG_METRIC_SUB_LABELS: Record<TargetMetric, string> = {
  booked: "Booked",
  sat: "Sat",
  talk_minutes: "Talk",
  dials: "Dials",
};

/**
 * The single CORE metric driving a crit/watch rollup, or null when zero or
 * several core metrics sit at that level (plain badge, no sub-label).
 * Additive display helper only — rollupRagState's worst-of logic and
 * thresholds are untouched. Dials (non-core) never names the badge.
 */
export function ragDrivingMetric(
  states: Record<TargetMetric, RagState>,
  rollup: RagState,
): TargetMetric | null {
  if (rollup !== "red" && rollup !== "amber") return null;
  const culprits = CORE_METRICS.filter((m) => states[m] === rollup);
  return culprits.length === 1 ? culprits[0] : null;
}
