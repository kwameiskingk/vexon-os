// Effective-target resolver — single source of truth for "what is subject X's
// target for metric M on date D". Every RAG/pace surface asks THIS function;
// no surface reads the target tables directly.
//
// Precedence (RAG_TARGETS_STEP1_DESIGN.md; the 2026-07-22 D4 blanket
// fallback to setter_weekly_goals stays REMOVED — that table must never be
// a general resolver layer):
//   1. PIP            — STUBBED this build (see resolvePipLayer below)
//   2. individual_targets  — per-person rows; exist only when a human set them
//   3. role_target_defaults — the universal minimum per role/department;
//        grain split: dials + talk daily, booked + sat weekly (curve-paced)
//
// NARROW EXCEPTION (2026-07-29, the owner's ruling — a deliberate, scoped
// reversal, not the old blanket fallback): the MANAGER RAG BOARD alone
// overlays a manager-set setter_weekly_goals row for the CURRENT week onto
// the BOOKED and SAT targets, AFTER this resolver runs — implemented in
// useFulfilmentRag.fetchRag, not here. This resolver still never reads
// setter_weekly_goals; dials/talk_minutes and every other consumer
// (Targets tab, Dev Center, review engines, the setter's own pill) are
// unaffected. Absent a weekly-goal row, booked/sat fall back to exactly
// this resolver's answer.
//
// Zero rule (Phase-2 amendment, 2026-07-22): "presence = intent" extends to
// zeros. An explicit row with value 0 is a deliberate human "no target this
// period" — it resolves to kind 'no_target' (reason 'explicit_zero') and does
// NOT fall through to lower layers. A metric no layer answers resolves to
// 'no_target' (reason 'unset'). Downstream (pace/RAG) branches on `kind`:
// a no_target metric has no expected-to-date and is never paced or scored.
//
// Role generalisation (Dev Center targets build, 2026-07-23): the tables are
// long-format and role-agnostic, so the resolver now serves any role. The
// setter-typed API (resolveSetterTargets / resolveSetterTargetsBatch) keeps
// its exact signature with `role` as a trailing parameter defaulting to
// "setter" — every pre-existing caller emits the identical query it always
// has. Arbitrary-metric resolution for other roles goes through
// resolveTargetsForRole.

import { supabase } from "@/integrations/supabase/client";

/**
 * Role → metric-name registry: the single place a role's metric set is
 * declared. UI pickers and the typed unions both derive from it.
 *
 * The DB `metric` column is free text — these are the AGREED names per role,
 * not a constraint. Setter names are load-bearing (the RAG reads them).
 * account_executive / sdr_manager names are the audit-proposed sets and may
 * be renamed until their review engines ship.
 */
export const ROLE_METRIC_SETS = {
  setter: ["booked", "sat", "dials", "talk_minutes"],
  account_executive: [
    "deals_closed",
    "cash_collected",
    "cold_calls",
    "talk_minutes",
    "reengaged_meetings",
  ],
  // Two DISTINCT sets, never merged (ruling 2026-07-28):
  // - coaching_sessions is the manager's PERSONAL target. The entered value
  //   is a snapshot tied to current team size (1 session/setter/week) — it is
  //   NOT auto-recalculated; update it manually when headcount changes.
  // - team_* metrics are the manager's own independently-set numbers for the
  //   team's combined performance — deliberately NOT derived by summing the
  //   setters' individual targets.
  // - The avg metrics are per-setter (headcount-independent): dials + talk
  //   at the daily grain, booked at the weekly grain (grain split is law).
  sdr_manager: [
    "coaching_sessions",
    "team_booked",
    "team_sat",
    "team_sat_rate_pct",
    "team_avg_dials_per_setter_day",
    "team_avg_talk_minutes_per_setter_day",
    "team_avg_booked_per_setter_week",
    "team_dials",
    "team_talk_minutes",
  ],
} as const;

export type TargetRole = keyof typeof ROLE_METRIC_SETS;
export type MetricForRole<R extends TargetRole> = (typeof ROLE_METRIC_SETS)[R][number];

/** Exactly the historical 4-value union — setter surfaces keep full strictness. */
export type TargetMetric = MetricForRole<"setter">;

export type TargetPeriod = "day" | "week" | "month";
/** "weekly_goal" is never emitted by this resolver — only by the manager RAG
 *  board's setter_weekly_goals overlay (useFulfilmentRag.fetchRag). */
export type TargetSource = "pip" | "individual" | "role_default" | "weekly_goal";

type ResolvedTargetOf<M extends string> =
  | {
      kind: "target";
      metric: M;
      value: number; // always > 0 — zeros resolve to no_target
      period: TargetPeriod;
      source: TargetSource;
    }
  | {
      kind: "no_target";
      metric: M;
      /** explicit_zero = a human wrote 0 at `source`; unset = no layer answered */
      reason: "explicit_zero" | "unset";
      source: TargetSource | null;
    };

/** Setter-typed resolved target — identical shape to the pre-generalisation type. */
export type ResolvedTarget = ResolvedTargetOf<TargetMetric>;
/** Resolved target over arbitrary metric names (Dev Center / non-setter roles). */
export type GenericResolvedTarget = ResolvedTargetOf<string>;

export type EffectiveTargets = Record<TargetMetric, ResolvedTarget>;

export const RAG_METRICS: TargetMetric[] = ["booked", "sat", "dials", "talk_minutes"];

export interface ResolveSubject {
  /** setters_profiles.id (setters); profiles.id for other roles. */
  setterProfileId: string;
  /** auth user id (setters_profiles.user_id) */
  setterUserId: string;
}

/** Monday (yyyy-mm-dd) of the ISO week containing the date. */
export function mondayOf(date: Date | string): string {
  const d = new Date(typeof date === "string" ? `${date}T00:00:00` : date);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * PIP layer — deliberate no-op this build.
 *
 * When PIP targets join the precedence (later build): query pip_records where
 * setter_profile_id matches, status = 'active' and the date falls within
 * start_date..end_date, then map target_metrics jsonb keys
 * { dials, meetings, talk_time } onto { dials, booked, talk_minutes } (all
 * daily grain), applying the same zero rule. Purely resolver-internal —
 * no schema change, no caller change.
 */
function resolvePipLayer(): Partial<Record<string, { value: number; period: TargetPeriod }>> {
  return {};
}

interface IndividualRow {
  subject_profile_id: string;
  metric: string;
  period: string;
  target_value: number;
  effective_from: string;
}

interface DefaultRow {
  metric: string;
  period: string;
  target_value: number;
}

const settle = (
  metric: string,
  value: number,
  period: TargetPeriod,
  source: TargetSource,
): GenericResolvedTarget =>
  Number(value) > 0
    ? { kind: "target", metric, value: Number(value), period, source }
    : { kind: "no_target", metric, reason: "explicit_zero", source };

const unset = (metric: string): GenericResolvedTarget => ({
  kind: "no_target",
  metric,
  reason: "unset",
  source: null,
});

/**
 * Generic batch core: effective targets for many subjects at once (two
 * queries), for any role and metric set. `date` decides individual-target
 * effectivity. Resolves exactly the metrics it is given — callers own the
 * metric list (typically ROLE_METRIC_SETS[role] plus any ad-hoc names).
 */
export async function resolveTargetsForRole(
  subjectProfileIds: string[],
  role: string,
  department: string,
  date: Date | string,
  metrics: readonly string[],
): Promise<Map<string, Record<string, GenericResolvedTarget>>> {
  const out = new Map<string, Record<string, GenericResolvedTarget>>();
  if (subjectProfileIds.length === 0) return out;
  if (metrics.length === 0) {
    for (const id of subjectProfileIds) out.set(id, {});
    return out;
  }

  const dateKey =
    typeof date === "string" ? date : new Date(date).toISOString().slice(0, 10);

  const [individualRes, defaultsRes] = await Promise.all([
    supabase
      .from("individual_targets")
      .select("subject_profile_id, metric, period, target_value, effective_from")
      .in("subject_profile_id", subjectProfileIds)
      .in("metric", metrics as string[])
      .lte("effective_from", dateKey),
    supabase
      .from("role_target_defaults")
      .select("metric, period, target_value")
      .eq("role", role)
      .eq("department", department)
      .in("metric", metrics as string[]),
  ]);

  // Missing tables pre-migration must degrade to "no target", never throw.
  const individualRows = (individualRes.error ? [] : (individualRes.data as unknown as IndividualRow[])) ?? [];
  const defaultRows = (defaultsRes.error ? [] : (defaultsRes.data as unknown as DefaultRow[])) ?? [];

  const defaultsByMetric = new Map<string, DefaultRow>();
  for (const r of defaultRows) defaultsByMetric.set(r.metric, r);

  // Latest effective_from wins per (subject, metric). When a daily and a
  // weekly override for the same metric share an effective date (e.g. Nadia
  // saves Daily Meetings and Weekly Meetings together), the DAILY row wins —
  // deterministic, and matches the role-default grain for daily metrics.
  const individualByKey = new Map<string, IndividualRow>();
  for (const r of individualRows) {
    const key = `${r.subject_profile_id}|${r.metric}`;
    const prev = individualByKey.get(key);
    if (
      !prev ||
      r.effective_from > prev.effective_from ||
      (r.effective_from === prev.effective_from && r.period === "day" && prev.period !== "day")
    ) {
      individualByKey.set(key, r);
    }
  }

  for (const subjectId of subjectProfileIds) {
    const pip = resolvePipLayer();
    const resolved: Record<string, GenericResolvedTarget> = {};

    for (const metric of metrics) {
      const pipHit = pip[metric];
      if (pipHit) {
        resolved[metric] = settle(metric, pipHit.value, pipHit.period, "pip");
        continue;
      }
      const individual = individualByKey.get(`${subjectId}|${metric}`);
      if (individual) {
        resolved[metric] = settle(
          metric,
          individual.target_value,
          individual.period as TargetPeriod,
          "individual",
        );
        continue;
      }
      const fallback = defaultsByMetric.get(metric);
      resolved[metric] = fallback
        ? settle(metric, fallback.target_value, fallback.period as TargetPeriod, "role_default")
        : unset(metric);
    }
    out.set(subjectId, resolved);
  }
  return out;
}

/**
 * Batch resolver: effective targets for many setters at once (two queries).
 * `date` decides individual-target effectivity. `role` trails with a
 * "setter" default so pre-existing callers are query-identical; metrics
 * outside the `metrics` filter resolve to unset, exactly as before.
 */
export async function resolveSetterTargetsBatch(
  subjects: ResolveSubject[],
  department: string,
  date: Date | string,
  metrics: TargetMetric[] = RAG_METRICS,
  role: string = "setter",
): Promise<Map<string, EffectiveTargets>> {
  const out = new Map<string, EffectiveTargets>();
  if (subjects.length === 0) return out;

  const profileIds = subjects.map((s) => s.setterProfileId);
  const core = await resolveTargetsForRole(profileIds, role, department, date, metrics);

  for (const subject of subjects) {
    const resolvedCore = core.get(subject.setterProfileId) ?? {};
    const resolved = {} as EffectiveTargets;
    for (const metric of RAG_METRICS) {
      resolved[metric] = (
        metrics.includes(metric) ? resolvedCore[metric] ?? unset(metric) : unset(metric)
      ) as ResolvedTarget;
    }
    out.set(subject.setterProfileId, resolved);
  }
  return out;
}

/** Single-setter convenience wrapper over the batch resolver. */
export async function resolveSetterTargets(
  subject: ResolveSubject,
  department: string,
  date: Date | string,
  metrics: TargetMetric[] = RAG_METRICS,
  role: string = "setter",
): Promise<EffectiveTargets> {
  const map = await resolveSetterTargetsBatch([subject], department, date, metrics, role);
  return (
    map.get(subject.setterProfileId) ?? {
      booked: unset("booked") as ResolvedTarget,
      sat: unset("sat") as ResolvedTarget,
      dials: unset("dials") as ResolvedTarget,
      talk_minutes: unset("talk_minutes") as ResolvedTarget,
    }
  );
}
