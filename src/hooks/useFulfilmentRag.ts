// RAG data for fulfilment setters — the ONE computation every RAG surface
// renders (Nadia's Metrics & Insights cards and the setter's floating
// widget).
//
// Display model (FIX 1, 2026-07-22): no metric ever shows a fractional
// "expected by now".
// - DAILY metrics (dials, talk): TODAY's actual vs the DAILY target on
//   screen. The COLOUR is intraday-paced on the live day (2026-07-30,
//   Nadia + Felix — deliberate reversal of the Phase-3 "no intraday
//   grace" ruling for daily metrics only): neutral before 40% of the UK
//   working day has elapsed, then judged against target × elapsed
//   fraction, full target once the day ends. See intradayDailyExpected.
// - WEEKLY metrics (booked, sat): THIS WEEK's running total vs the WEEKLY
//   target ("1 / 5"). The pace curve still decides the mid-week state
//   internally (absence-adjusted expected-to-date), but only the week
//   total, the weekly target and the colour are ever displayed. Untouched
//   by the intraday rule — zero-actual still reads Critical from day one.
//
// SSOT actuals: booked = meetings created_at, strict is_rebook=false,
// profile OR logged_by identity; sat = meeting_date + isMeetingSat;
// dials/talk = setter_close_metrics. Population: strict genuine-setter gate.
//
// Anchor day (2026-07-29): the manager board accepts an asOf day so the
// Metrics & Insights date picker shows that day's board ("today" = the
// selected day, "week" = its Mon-Fri). The setter pill remains live-only.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isMeetingSat, attendanceDayValue } from "@/lib/metrics/setterMetrics";
import { filterToSetterRoleIds } from "@/lib/setterRoleFilter";
import {
  resolveSetterTargetsBatch,
  mondayOf,
  RAG_METRICS,
  type EffectiveTargets,
  type ResolvedTarget,
  type TargetMetric,
} from "@/lib/targets/resolveTargets";
import {
  fetchPaceCurve,
  computeExpectedToDate,
  intradayDailyExpected,
  type AttendanceDay,
} from "@/lib/targets/paceExpectation";
import { metricRagState, attainmentPct, rollupRagState, type RagState } from "@/lib/targets/ragState";

export interface RagMetricView {
  metric: TargetMetric;
  /** What the surface displays: today's actual (daily) or week total (weekly). */
  actual: number;
  /** The displayed denominator: the daily or weekly target itself. Null = no target. */
  targetValue: number | null;
  /** 'day' = resets daily; 'week' = Mon-Fri running total. */
  basis: "day" | "week";
  state: RagState;
  /** Attainment % on the STATE basis (weekly states are curve-based). */
  pct: number | null;
  target: EffectiveTargets[TargetMetric];
}

export interface SetterRagView {
  setterProfileId: string;
  userId: string;
  metrics: Record<TargetMetric, RagMetricView>;
  rollup: RagState;
  /** FIX 8: an EXPLICIT absent mark for today (Nadia's register) — the
   *  setter is off, not underperforming. All metrics render neutral.
   *  An UNMARKED day is NOT absent: those setters stay live. */
  absentToday: boolean;
}

interface RagSubject {
  profileId: string;
  userId: string;
  closeUserId: string | null;
}

const DAILY_METRICS: TargetMetric[] = ["dials", "talk_minutes"];

/** LOCAL calendar day (yyyy-mm-dd). Was toISOString() = UTC, which shifted
 *  "today" to yesterday for UK users between midnight and 1am BST. Local
 *  matches mondayOf() and the attendance/pace day semantics. */
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function fetchRag(
  subjects: RagSubject[],
  department: "fulfilment" | "acquisition" = "fulfilment",
  asOfKey?: string,
  // the owner's 2026-07-29 ruling: overlay manager-set setter_weekly_goals rows
  // for the anchor week onto BOOKED/SAT targets. Set by the manager board
  // and by the setter's own pill (self-read RLS added in migration
  // 20260729150000 — pre-migration the query returns no rows and the
  // resolver fallback applies, so merge order is safe).
  weeklyGoalOverlay = false,
): Promise<Map<string, SetterRagView>> {
  const out = new Map<string, SetterRagView>();
  if (subjects.length === 0) return out;

  // Anchor day: today by default (the live alert), or a caller-selected day
  // (the manager board's date picker). Every window below — attendance,
  // booked/sat week, Close dials/talk day, target resolution — derives from
  // this one value, so a historical asOf yields that day's board.
  const asOf = asOfKey ?? todayKey();
  const weekStart = mondayOf(asOf);
  const userIds = subjects.map((s) => s.userId);
  const closeIds = subjects.map((s) => s.closeUserId).filter(Boolean) as string[];

  const [targetsMap, weights, attendanceRes, bookedRes, satRes, closeTodayRes, weeklyGoalsRes] = await Promise.all([
    resolveSetterTargetsBatch(
      subjects.map((s) => ({ setterProfileId: s.profileId, setterUserId: s.userId })),
      department,
      asOf,
    ),
    fetchPaceCurve(department),
    supabase
      .from("employee_attendance")
      .select("employee_id, date, status")
      .in("employee_id", userIds)
      .gte("date", weekStart)
      .lte("date", asOf),
    supabase
      .from("meetings")
      .select("setter_profile_id, logged_by_setter_id, created_at")
      .eq("department", department)
      .eq("is_rebook", false)
      .gte("created_at", `${weekStart}T00:00:00`)
      .lte("created_at", `${asOf}T23:59:59`),
    supabase
      .from("meetings")
      .select("setter_profile_id, logged_by_setter_id, attendance_confirmed, attendance_status")
      .eq("department", department)
      .eq("is_rebook", false)
      .gte("meeting_date", weekStart)
      .lte("meeting_date", asOf),
    closeIds.length > 0
      ? supabase
          .from("setter_close_metrics")
          .select("close_user_id, dials, talk_time_seconds")
          .in("close_user_id", closeIds)
          .eq("date", asOf)
      : Promise.resolve({ data: [], error: null }),
    weeklyGoalOverlay
      ? supabase
          .from("setter_weekly_goals")
          .select("setter_user_id, goal_metric, target_value")
          .eq("week_start", weekStart)
          .in("setter_user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const attendanceByUser = new Map<string, AttendanceDay[]>();
  for (const row of attendanceRes.data || []) {
    const list = attendanceByUser.get(row.employee_id) ?? [];
    list.push({ date: row.date, status: row.status });
    attendanceByUser.set(row.employee_id, list);
  }

  // Weekly-goal overlay map: `${user_id}|${metric}` -> goal value for the
  // anchor week. goal_metric maps meetings_booked->booked, sat_meetings->sat.
  const GOAL_METRIC_MAP: Record<string, TargetMetric> = {
    meetings_booked: "booked",
    sat_meetings: "sat",
  };
  const weeklyGoalByUserMetric = new Map<string, number>();
  for (const g of weeklyGoalsRes.data || []) {
    const metric = GOAL_METRIC_MAP[g.goal_metric];
    if (metric && g.target_value != null) {
      weeklyGoalByUserMetric.set(`${g.setter_user_id}|${metric}`, Number(g.target_value));
    }
  }

  const bookedRows = bookedRes.data || [];
  const satRows = (satRes.data || []).filter((m) => isMeetingSat(m));
  const todayByUser = new Map<string, { dials: number; talkSeconds: number }>();
  for (const row of closeTodayRes.data || []) {
    const agg = todayByUser.get(row.close_user_id) ?? { dials: 0, talkSeconds: 0 };
    agg.dials += Number(row.dials) || 0;
    agg.talkSeconds += Number(row.talk_time_seconds) || 0;
    todayByUser.set(row.close_user_id, agg);
  }

  const countMine = (
    rows: Array<{ setter_profile_id: string | null; logged_by_setter_id: string | null }>,
    s: RagSubject,
  ) =>
    rows.filter(
      (m) => m.setter_profile_id === s.profileId || m.logged_by_setter_id === s.userId,
    ).length;

  for (const s of subjects) {
    const targets = targetsMap.get(s.profileId);
    const attendance = attendanceByUser.get(s.userId) ?? [];
    const today = s.closeUserId ? todayByUser.get(s.closeUserId) : undefined;

    // Explicitly marked off today (the only zero-value status is 'absent').
    // No row for today = register not done yet = live as normal.
    const absentToday = attendance.some(
      (a) => a.date === asOf && attendanceDayValue(a.status) === 0,
    );

    const actuals: Record<TargetMetric, number> = {
      booked: countMine(bookedRows, s),
      sat: countMine(satRows, s),
      dials: today?.dials ?? 0,
      talk_minutes: Math.round((today?.talkSeconds ?? 0) / 60),
    };

    const metrics = {} as Record<TargetMetric, RagMetricView>;
    const states = {} as Record<TargetMetric, RagState>;
    for (const metric of RAG_METRICS) {
      let target: ResolvedTarget =
        targets?.[metric] ?? { kind: "no_target" as const, metric, reason: "unset" as const, source: null };
      // Manager weekly-goal overlay — booked/sat only (the map never holds
      // other metrics), current anchor week only, resolver fallback when no
      // goal row exists. House zero rule: an explicit 0 goal = deliberate
      // "no target this week", no fall-through.
      const weeklyGoal = weeklyGoalByUserMetric.get(`${s.userId}|${metric}`);
      if (weeklyGoal !== undefined) {
        target =
          weeklyGoal > 0
            ? { kind: "target", metric, value: weeklyGoal, period: "week", source: "weekly_goal" }
            : { kind: "no_target", metric, reason: "explicit_zero", source: "weekly_goal" };
      }
      const isDaily = DAILY_METRICS.includes(metric);

      // State basis (colour only — display always shows the full target):
      // daily = intraday-paced on the live day (neutral in the morning grace
      // window, target × elapsed UK-working-day fraction after, full target
      // for ended/historical days); weekly = the curve's absence-adjusted
      // expected-to-date, untouched.
      let stateBasisExpected: number | null = null;
      if (target.kind === "target") {
        stateBasisExpected = isDaily
          ? intradayDailyExpected(target.value, asOf === todayKey())
          : computeExpectedToDate(target, weights, attendance, asOf).expected;
      }
      const state: RagState = absentToday
        ? "no_target"
        : metricRagState(actuals[metric], stateBasisExpected);
      states[metric] = state;
      metrics[metric] = {
        metric,
        actual: actuals[metric],
        targetValue: target.kind === "target" ? target.value : null,
        basis: isDaily ? "day" : "week",
        state,
        pct: attainmentPct(actuals[metric], stateBasisExpected),
        target,
      };
    }

    out.set(s.profileId, {
      setterProfileId: s.profileId,
      userId: s.userId,
      metrics,
      rollup: absentToday ? "no_target" : rollupRagState(states),
      absentToday,
    });
  }
  return out;
}

/** All genuine active setters of the given department — the manager Metrics &
 *  Insights board. `asOfKey` (yyyy-MM-dd) anchors the board to a selected day
 *  (the page's date picker); omitted = today, the live alert. The setter's
 *  own pill (useOwnSetterRag) never passes asOf and stays live. */
export function useFulfilmentRagBoard(
  department: "fulfilment" | "acquisition" = "fulfilment",
  asOfKey?: string,
) {
  const asOf = asOfKey ?? todayKey();
  const isLive = asOf === todayKey();
  return useQuery({
    queryKey: ["fulfilment-rag-board", department, asOf],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("setters_profiles")
        .select("id, user_id, close_user_id")
        .eq("department", department)
        .eq("active", true)
        .eq("is_test_account", false);
      if (error) throw error;
      const setterIds = await filterToSetterRoleIds((profiles || []).map((p) => p.user_id));
      const subjects: RagSubject[] = (profiles || [])
        .filter((p) => p.user_id && setterIds.has(p.user_id))
        .map((p) => ({ profileId: p.id, userId: p.user_id!, closeUserId: p.close_user_id ?? null }));
      return fetchRag(subjects, department, asOf, true);
    },
    // Booked/sat change the moment a meeting is logged in Vexon OS; a 60s
    // poll + focus refetch caps cross-user staleness at a minute (writes on
    // the SAME client invalidate immediately — see the meeting-write sites).
    // Historical days are settled data — no poll, cache until day change.
    staleTime: isLive ? 30_000 : Infinity,
    refetchInterval: isLive ? 60_000 : false,
    refetchOnWindowFocus: isLive,
  });
}

/** The signed-in setter's own RAG (fulfilment + acquisition; null otherwise).
 *  Acquisition opened 2026-07-30: all four acquisition setters carry full
 *  individual_targets rows (seeded 27 Jul), so the pill resolves real
 *  targets; the pace curve falls back to the even default until an
 *  acquisition curve row exists. */
export function useOwnSetterRag() {
  return useQuery({
    queryKey: ["own-setter-rag", todayKey()],
    queryFn: async (): Promise<SetterRagView | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("setters_profiles")
        .select("id, user_id, close_user_id, department")
        .eq("user_id", user.id)
        .maybeSingle();
      if (
        !profile ||
        (profile.department !== "fulfilment" && profile.department !== "acquisition")
      ) {
        return null;
      }
      // weeklyGoalOverlay: the pill evaluates against the same weekly Booked/
      // SAT goals the manager board uses, so the two can never disagree for
      // the same week (needs the setter self-read policy, 20260729150000).
      const map = await fetchRag(
        [
          {
            profileId: profile.id,
            userId: user.id,
            closeUserId: profile.close_user_id ?? null,
          },
        ],
        profile.department as "fulfilment" | "acquisition",
        undefined,
        true,
      );
      return map.get(profile.id) ?? null;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
