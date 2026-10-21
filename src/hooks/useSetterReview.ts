import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { filterToSetterRoleIds } from "@/lib/setterRoleFilter";
import { fetchSetterTargets, type SetterTargets } from "@/hooks/useSetterTargets";
import { createReviewAndStartNarrative } from "@/hooks/reviewEngine";
import { fetchOffboardedUserMap } from "@/hooks/useOffboardedUsers";
import {
  aggregateSetterActivity,
  computeDailyActivity,
  computeDayHighlights,
  computeSitRatePct,
  daysWorkedFromAttendance,
  isMeetingSat,
  pctDelta,
  safeRatio,
  type ActivityRow,
  type AttendanceStatusRow,
  type CloseMetricRow,
  type DayHighlights,
  type ManualRow,
} from "@/lib/metrics/setterMetrics";
import { firstOfMonth, getWorkWeekRange, lastOfMonth, toISODate } from "@/lib/workWeek";
import { fetchReviewOverride, type OverridableReviewMetric } from "@/hooks/useSetterReviewOverrides";

// Escape hatch for tables newer than the generated types (types.ts is stale
// until the owner regenerates it — house pattern, same as useSetterTargets).
const db: SupabaseClient = supabase;

/**
 * Monthly Performance Review — compile layer (setter scope, v2).
 *
 * Every number here comes from the SAME shared implementations the
 * leaderboards and CEO tiles use (aggregateSetterActivity / isMeetingSat /
 * computeSitRatePct / safeRatio / pctDelta in src/lib/metrics/setterMetrics.ts,
 * targets via useSetterTargets). Never add a formula here — extract it to the
 * shared module first.
 *
 * v2 (Nadia's sheet alignment):
 * - Daily averages divide by ACTUAL days worked from the attendance capture
 *   (present/late = 1, half_day = 0.5) — never calendar working days. If no
 *   attendance is marked for the window, daily averages are null ("—"), we
 *   never silently fall back to calendar days.
 * - Show rate is NOT capped at 100% (sat can include prior-period bookings).
 * - Suppositions: meetings booked per sat, and dials per booking (labelled
 *   DIALS deliberately — Nadia's sheet mislabels a talk-time formula there;
 *   his stated coaching intent is dials).
 * - Three windows: single month (with deltas vs prior month), rolling
 *   3-month, all-time. Multi-month windows SUM totals and recompute rates
 *   from the summed totals; deltas exist only on the single-month view.
 *
 * The compiled_metrics JSON this produces is the ONLY thing the AI narrative
 * ever sees: finished figures, targets and deltas. No formulas, no raw rows.
 */

export type ReviewWindowKind = "week" | "month" | "rolling3" | "all_time";

export const WINDOW_KIND_LABELS: Record<ReviewWindowKind, string> = {
  month: "Single month",
  week: "Single week",
  rolling3: "Rolling 3-month",
  all_time: "All-time",
};

/** Anchor-picker heading per window kind (replaces the per-view ternaries). */
export const WINDOW_ANCHOR_LABELS: Record<ReviewWindowKind, string> = {
  month: "Month",
  week: "Week",
  rolling3: "Ending month",
  all_time: "Up to month",
};

/** Query floor for all-time windows — predates all app data. */
const ALL_TIME_FLOOR_ISO = "2020-01-01";

export interface ResolvedReviewWindow {
  kind: ReviewWindowKind;
  startISO: string;
  endISO: string;
  label: string;
  /** Present only for kind === "month" | "week" — deltas compare this range. */
  priorStartISO?: string;
  priorEndISO?: string;
  priorLabel?: string;
}

const monthLabel = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

/** "Mon 3 – Fri 7 Aug 2026" (Monday's month spelled out when the week
 *  crosses a month boundary: "Mon 28 Jul – Fri 1 Aug 2026"). */
export const workWeekLabel = (monday: Date): string => {
  const { friday } = getWorkWeekRange(monday);
  const dayMonth = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const mondayPart = monday.getMonth() === friday.getMonth() ? `${monday.getDate()}` : dayMonth(monday);
  return `Mon ${mondayPart} – Fri ${dayMonth(friday)} ${friday.getFullYear()}`;
};

export const workWeekKey = (monday: Date) => toISODate(monday);

/** The last `count` COMPLETED Mon–Fri work weeks (Mondays, newest first) —
 *  the current week is excluded, mirroring the completed-months rule. */
export function completedWorkWeeks(count = 12): Date[] {
  const { monday: currentMonday } = getWorkWeekRange(new Date());
  const weeks: Date[] = [];
  for (let i = 1; i <= count; i++) {
    const m = new Date(currentMonday);
    m.setDate(currentMonday.getDate() - 7 * i);
    weeks.push(m);
  }
  return weeks;
}

/**
 * Resolve a window from its kind + anchor. For month-based kinds the anchor
 * is treated as a month; for "week" it is any date inside the desired
 * Mon–Fri work week. Month windows end at the end of the anchor month
 * (all-time included) so lookups stay deterministic.
 */
export function resolveReviewWindow(kind: ReviewWindowKind, anchorMonth: Date): ResolvedReviewWindow {
  if (kind === "week") {
    const { monday, friday } = getWorkWeekRange(anchorMonth);
    const priorMonday = new Date(monday);
    priorMonday.setDate(monday.getDate() - 7);
    const priorFriday = new Date(friday);
    priorFriday.setDate(friday.getDate() - 7);
    return {
      kind,
      startISO: toISODate(monday),
      endISO: toISODate(friday),
      label: workWeekLabel(monday),
      priorStartISO: toISODate(priorMonday),
      priorEndISO: toISODate(priorFriday),
      priorLabel: workWeekLabel(priorMonday),
    };
  }
  const anchorStart = firstOfMonth(anchorMonth);
  const anchorEnd = lastOfMonth(anchorMonth);
  if (kind === "month") {
    const priorStart = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() - 1, 1);
    const priorEnd = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth(), 0);
    return {
      kind,
      startISO: toISODate(anchorStart),
      endISO: toISODate(anchorEnd),
      label: monthLabel(anchorStart),
      priorStartISO: toISODate(priorStart),
      priorEndISO: toISODate(priorEnd),
      priorLabel: monthLabel(priorStart),
    };
  }
  if (kind === "rolling3") {
    const start = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() - 2, 1);
    return {
      kind,
      startISO: toISODate(start),
      endISO: toISODate(anchorEnd),
      label: `${monthLabel(start)} – ${monthLabel(anchorStart)}`,
    };
  }
  return {
    kind,
    startISO: ALL_TIME_FLOOR_ISO,
    endISO: toISODate(anchorEnd),
    label: `All time (to ${monthLabel(anchorStart)})`,
  };
}

export interface ReviewSetter {
  id: string; // setters_profiles.id
  user_id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  close_user_id: string | null;
  active: boolean | null;
  is_test_account: boolean | null;
  current_coaching_focus: string | null;
  /** profiles.offboarded_at — set when the person has left the company. */
  offboarded_at?: string | null;
}

/**
 * The one deliberate exception to the picker's active-only rule: the Taylor
 * Test demo account (inactive + is_test_account) stays listed so seeded
 * reviews can be demonstrated. Ruling A, 2026-07-21.
 */
const TOMMY_TEST_USER_ID = "b0c8fab0-32f0-4650-80d7-407a88e6164d";

/**
 * Setter picker population (Ruling A, 2026-07-21): ACTIVE genuine setters
 * only, plus Taylor Test. Other test/inactive setters are excluded. This is
 * a per-setter staff-only drill-down, not an aggregate — but any
 * cross-setter aggregation added to the review later MUST re-apply
 * .eq("is_test_account", false) + filterToSetterRoleIds; nothing enforces
 * it at DB level.
 */
export function useReviewSetters(includeFormer = false) {
  return useQuery({
    queryKey: ["performance-review-setters", includeFormer],
    queryFn: async (): Promise<ReviewSetter[]> => {
      const { data, error } = await supabase
        .from("setters_profiles")
        .select(
          "id, user_id, full_name, email, department, close_user_id, active, is_test_account, current_coaching_focus",
        )
        .order("full_name");
      if (error) throw error;
      const setterRoleIds = await filterToSetterRoleIds(
        ((data || []) as ReviewSetter[]).map((r) => r.user_id),
      );

      // "Former" means offboarded (profiles.offboarded_at) OR benched
      // (setters_profiles.active = false). Reading the platform flag as well
      // means a leaver who was never benched — or was never a setter on the
      // bench at all — still classifies correctly, so a setter who left
      // mid-month is picked up by the Include-former toggle and their month's
      // retained dials/booked/sat still compile into the review.
      const offboarded = await fetchOffboardedUserMap();
      const rows = ((data || []) as ReviewSetter[]).map((r) => {
        const offboardedAt = (r.user_id && offboarded.get(r.user_id)) || null;
        return {
          ...r,
          offboarded_at: offboardedAt,
          active: offboardedAt ? false : r.active,
        };
      });

      // includeFormer admits former setters — their reviews compile from
      // history exactly like current ones; RLS permits it.
      return rows.filter(
        (r) =>
          r.user_id &&
          setterRoleIds.has(r.user_id) &&
          (r.user_id === TOMMY_TEST_USER_ID ||
            ((includeFormer || r.active === true) && r.is_test_account !== true)),
      );
    },
  });
}

export interface CompiledMetricValue {
  value: number | null;
  prior: number | null;
  delta_pct: number | null;
  target?: number | null;
  target_basis?: string;
}

export interface CompiledMetrics {
  version: 2;
  setter: {
    first_name: string;
    full_name: string;
    department: string | null;
  };
  window: {
    kind: ReviewWindowKind;
    start: string;
    end: string;
    label: string;
    days_worked: number;
    days_worked_source: "attendance";
    prior?: { start: string; end: string; label: string; days_worked: number };
    /**
     * Present when a setter_review_metric_overrides row shaped this month's
     * figures (Elena's ask, 8 Sep 2026). `computed` keeps the un-overridden
     * numbers so the editor can show "Computed: X" and a clear reverts
     * cleanly. Provenance only — the narrative prompt reads totals/rates.
     */
    adjusted?: {
      metrics: OverridableReviewMetric[];
      computed: Record<OverridableReviewMetric, number>;
      by: string | null;
      at: string;
      reason: string | null;
    };
  };
  /** Window totals (sums). Deltas populated only on the single-month view. */
  totals: Record<string, CompiledMetricValue>;
  /** Rates recomputed from the window's summed totals — never averaged monthly rates. */
  rates: {
    /** NOT capped at 100 — sat can include prior-period bookings. */
    show_rate_pct: CompiledMetricValue;
    connect_rate_pct: CompiledMetricValue;
  };
  /** Window total ÷ window days-worked. Null when no attendance is marked. */
  daily: Record<string, CompiledMetricValue>;
  /** Coaching ratios (Nadia's "suppositions"). Divide-by-zero → null. */
  suppositions: {
    meetings_booked_per_sat: CompiledMetricValue;
    dials_per_booking: CompiledMetricValue;
  };
  /**
   * Deterministic per-period day highlights (strongest / least active),
   * computed in code over WORKED days only — never written by the narrative
   * model. Omitted when the window has too few worked days to be meaningful.
   */
  highlights?: DayHighlights;
  targets: {
    daily_dials: number;
    daily_meetings: number;
    daily_talk_minutes: number;
    weekly_meetings: number;
    /** Present only on the single-month view. */
    monthly_meetings?: number;
    monthly_meetings_source?: "typed_goal" | "weekly_target_x4";
  };
  coaching: {
    sessions_in_period: number;
    last_session_date: string | null;
    session_types_in_period: string[];
    current_focus: string | null;
  };
  pip: { active: boolean; start_date?: string; reason?: string; status?: string };
  modules: {
    per_client?: Array<{
      client: string;
      assignment_status: string;
      meeting_target: number | null;
      meetings_completed: number | null;
      booked_in_period: number;
      sat_in_period: number;
    }>;
    call_qa?: {
      calls_scored: number;
      avg_weighted_total: number | null;
      gates_passed: number;
      gates_failed: number;
      rating_counts: Record<string, number>;
      prior: { calls_scored: number; avg_weighted_total: number | null };
    };
    appointment_scores?: {
      meetings_scored: number;
      avg_overall_quality: number | null;
      quality_meetings: number;
      avg_fit: number | null;
      avg_engagement: number | null;
      avg_authority: number | null;
      avg_next_step: number | null;
      prior: { meetings_scored: number; avg_overall_quality: number | null };
    };
  };
}

interface MeetingRow {
  id: string;
  created_at: string;
  meeting_date: string | null;
  attendance_confirmed: boolean | null;
  attendance_status: string | null;
  client_profile_id: string | null;
}

const round1 = (n: number | null): number | null => (n == null ? null : Math.round(n * 10) / 10);
const inDateRange = (iso: string, startISO: string, endISO: string) => {
  const day = iso.slice(0, 10);
  return day >= startISO && day <= endISO;
};
const avgOf = (nums: number[]): number | null =>
  nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

interface WindowNumbers {
  daysWorked: number;
  dials: number;
  talkMinutes: number;
  conversations: number;
  connects3Plus: number;
  connectRate: number;
  meetingsBooked: number;
  warmLeads: number;
  meetingsSatPopulation: MeetingRow[];
  meetingsSat: number;
  showRatePct: number | null;
}

/**
 * Compile one setter's review for a window resolved by resolveReviewWindow.
 * Multi-month windows sum totals and recompute rates from the sums; deltas
 * exist only for kind === "month".
 */
export async function compileSetterReviewMetrics(
  setter: ReviewSetter,
  window: ResolvedReviewWindow,
): Promise<CompiledMetrics> {
  const { startISO, endISO } = window;
  const hasPrior =
    (window.kind === "month" || window.kind === "week") &&
    !!window.priorStartISO &&
    !!window.priorEndISO;
  // One fetch spans prior+current for the month view; window-only otherwise.
  const fetchStartISO = hasPrior ? (window.priorStartISO as string) : startISO;

  const meetingFilters = [
    `setter_profile_id.eq.${setter.id}`,
    `logged_by_setter_id.eq.${setter.user_id}`,
  ].join(",");

  const [
    closeRes,
    meetingsByCreatedRes,
    meetingsByDateRes,
    warmLeadsRes,
    manualRes,
    attendanceRes,
    targets,
    goalRes,
    coachingRes,
    pipRes,
    assignmentsRes,
    callScoresRes,
  ] = await Promise.all([
    setter.close_user_id
      ? supabase
          .from("setter_close_metrics")
          .select("close_user_id, date, dials, talk_time_seconds, connects, connects_3_plus_mins")
          .eq("close_user_id", setter.close_user_id)
          .gte("date", fetchStartISO)
          .lte("date", endISO)
      : Promise.resolve({ data: [] as CloseMetricRow[], error: null }),
    // Booked = created_at in window, rebooks excluded (leaderboard convention).
    supabase
      .from("meetings")
      .select("id, created_at, meeting_date, attendance_confirmed, attendance_status, client_profile_id")
      .eq("is_rebook", false)
      .gte("created_at", `${fetchStartISO}T00:00:00`)
      .lte("created_at", `${endISO}T23:59:59`)
      .or(meetingFilters),
    // Sat + show rate use the meeting_date population (CEO tile convention).
    supabase
      .from("meetings")
      .select("id, created_at, meeting_date, attendance_confirmed, attendance_status, client_profile_id")
      .eq("is_rebook", false)
      .gte("meeting_date", fetchStartISO)
      .lte("meeting_date", endISO)
      .or(meetingFilters),
    supabase
      .from("warm_leads")
      .select("created_at")
      .gte("created_at", `${fetchStartISO}T00:00:00`)
      .lte("created_at", `${endISO}T23:59:59`)
      .or(`created_by_user_id.eq.${setter.user_id},assigned_setter_id.eq.${setter.user_id}`),
    supabase
      .from("manual_daily_metrics")
      .select("date, conversations, warm_leads, meetings_booked_input")
      .eq("target_user_id", setter.user_id)
      .eq("target_role", "setter")
      .eq("department", (setter.department ?? "acquisition") as "acquisition" | "fulfilment")
      .gte("date", fetchStartISO)
      .lte("date", endISO),
    // Days worked come from the Ops Command attendance capture — the ONLY
    // sanctioned divisor for daily averages in the review.
    supabase
      .from("employee_attendance")
      .select("date, status")
      .eq("employee_id", setter.user_id)
      .gte("date", fetchStartISO)
      .lte("date", endISO),
    fetchSetterTargets(setter.id),
    // performance_goals quirk (GoalProgress/CEOGoals parity): for setters the
    // user_id column stores the setters_profiles.id, not the auth user id.
    window.kind === "month"
      ? db
          .from("performance_goals")
          .select("monthly_target")
          .eq("role_type", "setter")
          .eq("metric", "booked_meetings")
          .eq("user_id", setter.id)
          .eq("month", startISO)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("coaching_sessions")
      .select("session_date, session_type, status")
      .eq("setter_profile_id", setter.id)
      .lte("session_date", endISO)
      .order("session_date", { ascending: false })
      .limit(50),
    supabase
      .from("pip_records")
      .select("start_date, end_date, reason, status")
      .eq("setter_profile_id", setter.id)
      .order("start_date", { ascending: false }),
    // setter_client_assignments.setter_id holds the auth user id.
    supabase
      .from("setter_client_assignments")
      .select("client_id, status, meeting_target, meetings_completed, started_at, ends_at, client_profiles ( company_name )")
      .eq("setter_id", setter.user_id),
    // call_scores.setter_id is text and holds either the Close user id or the
    // auth user id depending on the n8n workflow version — match all knowns.
    db
      .from("call_scores")
      .select("call_date, weighted_total, performance_rating, mandatory_gates_passed")
      .gte("call_date", fetchStartISO)
      .lte("call_date", endISO)
      .in(
        "setter_id",
        [setter.close_user_id, setter.user_id, setter.id].filter(Boolean) as string[],
      ),
  ]);

  const closeRows = (closeRes.data || []) as CloseMetricRow[];
  const meetingsByCreated = (meetingsByCreatedRes.data || []) as MeetingRow[];
  const meetingsByDate = (meetingsByDateRes.data || []) as MeetingRow[];
  const warmLeadRows = (warmLeadsRes.data || []) as ActivityRow[];
  const manualRows = (manualRes.data || []) as ManualRow[];
  const attendanceRows = (attendanceRes.data || []) as Array<AttendanceStatusRow & { date: string }>;

  const splitByCreated = <T extends { created_at: string }>(rows: T[], s: string, e: string): T[] =>
    rows.filter((r) => inDateRange(r.created_at, s, e));

  const numbersFor = (s: string, e: string): WindowNumbers => {
    const totals = aggregateSetterActivity(
      closeRows.filter((r) => inDateRange(r.date, s, e)),
      splitByCreated(meetingsByCreated, s, e),
      splitByCreated(warmLeadRows, s, e),
      manualRows.filter((r) => inDateRange(r.date, s, e)),
    );
    const satPopulation = meetingsByDate.filter((m) => m.meeting_date && inDateRange(m.meeting_date, s, e));
    const sat = satPopulation.filter(isMeetingSat).length;
    return {
      daysWorked: daysWorkedFromAttendance(
        attendanceRows.filter((r) => inDateRange(r.date, s, e)),
      ),
      dials: totals.dials,
      talkMinutes: Math.round(totals.talkSeconds / 60),
      conversations: totals.conversations,
      connects3Plus: totals.connects3Plus,
      connectRate: totals.connectRate,
      meetingsBooked: totals.meetings,
      warmLeads: totals.warmLeads,
      meetingsSatPopulation: satPopulation,
      meetingsSat: sat,
      // Uncapped by design — see computeSitRatePct.
      showRatePct: computeSitRatePct(sat, satPopulation.length),
    };
  };

  const cur = numbersFor(startISO, endISO);
  const prev = hasPrior
    ? numbersFor(window.priorStartISO as string, window.priorEndISO as string)
    : null;

  // Manual adjustments (setter_review_metric_overrides): a row for this
  // setter + month wins over the computed booked / sat / warm-lead figures
  // ON THIS SURFACE ONLY, so every downstream number (totals, show rate,
  // suppositions, the narrative) is derived from the resolved values. Show
  // rate becomes sat ÷ booked once either is adjusted — the computed formula
  // divides by the meeting_date population, which is not what an editor
  // typing "22 booked, 8 sat" expects. Month windows only; the prior month
  // keeps its computed figures.
  const computedCur: Record<OverridableReviewMetric, number> = {
    meetings_booked: cur.meetingsBooked,
    meetings_sat: cur.meetingsSat,
    warm_leads: cur.warmLeads,
  };
  const override = window.kind === "month" ? await fetchReviewOverride(setter.id, startISO) : null;
  const adjustedMetrics: OverridableReviewMetric[] = [];
  if (override) {
    if (override.meetings_booked != null) {
      cur.meetingsBooked = override.meetings_booked;
      adjustedMetrics.push("meetings_booked");
    }
    if (override.meetings_sat != null) {
      cur.meetingsSat = override.meetings_sat;
      adjustedMetrics.push("meetings_sat");
    }
    if (override.warm_leads != null) {
      cur.warmLeads = override.warm_leads;
      adjustedMetrics.push("warm_leads");
    }
    if (adjustedMetrics.includes("meetings_booked") || adjustedMetrics.includes("meetings_sat")) {
      cur.showRatePct = computeSitRatePct(cur.meetingsSat, cur.meetingsBooked);
    }
  }
  let adjustedBy: string | null = null;
  if (override && adjustedMetrics.length > 0) {
    const { data: setterProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", override.set_by)
      .maybeSingle();
    adjustedBy = setterProfile?.full_name ?? null;
  }

  const metric = (
    value: number | null,
    prior: number | null,
    target?: number | null,
    target_basis?: string,
  ): CompiledMetricValue => ({
    value: round1(value),
    prior: round1(prior),
    delta_pct: value != null && prior != null ? round1(pctDelta(value, prior)) : null,
    ...(target !== undefined ? { target: round1(target) } : {}),
    ...(target_basis ? { target_basis } : {}),
  });

  const typedGoal = goalRes?.data?.monthly_target != null ? Number(goalRes.data.monthly_target) : null;
  // Month: typed monthly goal, else weekly target × 4. Week: the weekly
  // target itself (no invented weekly goals). Other kinds: no target.
  const monthlyMeetingsTarget =
    window.kind === "month"
      ? typedGoal ?? (targets as SetterTargets).weekly_meetings_target * 4
      : window.kind === "week"
        ? (targets as SetterTargets).weekly_meetings_target
        : null;

  const totals: Record<string, CompiledMetricValue> = {
    dials: metric(cur.dials, prev?.dials ?? null),
    talk_time_minutes: metric(cur.talkMinutes, prev?.talkMinutes ?? null),
    conversations: metric(cur.conversations, prev?.conversations ?? null),
    connects_3_plus_min: metric(cur.connects3Plus, prev?.connects3Plus ?? null),
    meetings_booked: metric(
      cur.meetingsBooked,
      prev?.meetingsBooked ?? null,
      monthlyMeetingsTarget,
      monthlyMeetingsTarget != null
        ? typedGoal != null
          ? "typed monthly goal"
          : "weekly meetings target x 4"
        : undefined,
    ),
    meetings_sat: metric(cur.meetingsSat, prev?.meetingsSat ?? null),
    warm_leads: metric(cur.warmLeads, prev?.warmLeads ?? null),
  };

  // Daily averages: window total ÷ window days-worked (attendance). No
  // attendance marked → null, NEVER a calendar-days fallback.
  const daily: Record<string, CompiledMetricValue> = {
    dials: metric(
      safeRatio(cur.dials, cur.daysWorked),
      prev ? safeRatio(prev.dials, prev.daysWorked) : null,
      targets.daily_dials_target,
      "daily dials target",
    ),
    talk_time_minutes: metric(
      safeRatio(cur.talkMinutes, cur.daysWorked),
      prev ? safeRatio(prev.talkMinutes, prev.daysWorked) : null,
      targets.daily_talk_time_target,
      "daily talk-time target (minutes)",
    ),
    conversations: metric(
      safeRatio(cur.conversations, cur.daysWorked),
      prev ? safeRatio(prev.conversations, prev.daysWorked) : null,
    ),
  };

  const rates = {
    show_rate_pct: metric(cur.showRatePct, prev?.showRatePct ?? null),
    connect_rate_pct: metric(cur.connectRate, prev?.connectRate ?? null),
  };

  const suppositions = {
    meetings_booked_per_sat: metric(
      safeRatio(cur.meetingsBooked, cur.meetingsSat),
      prev ? safeRatio(prev.meetingsBooked, prev.meetingsSat) : null,
    ),
    dials_per_booking: metric(
      safeRatio(cur.dials, cur.meetingsBooked),
      prev ? safeRatio(prev.dials, prev.meetingsBooked) : null,
    ),
  };

  // Day highlights: per-day activity over WORKED days only, aggregated by
  // the same SSOT function as the window totals, then picked in code.
  const highlights = computeDayHighlights(
    computeDailyActivity(
      closeRows.filter((r) => inDateRange(r.date, startISO, endISO)),
      splitByCreated(meetingsByCreated, startISO, endISO),
      splitByCreated(warmLeadRows, startISO, endISO),
      manualRows.filter((r) => inDateRange(r.date, startISO, endISO)),
      attendanceRows.filter((r) => inDateRange(r.date, startISO, endISO)),
    ),
  );

  const coachingRows = (coachingRes.data || []) as Array<{
    session_date: string; session_type: string | null; status: string | null;
  }>;
  const coachingInPeriod = coachingRows.filter(
    (c) => c.session_date >= startISO && c.session_date <= endISO && c.status === "completed",
  );
  const lastSession = coachingRows.find((c) => c.status === "completed") ?? null;

  const pipRows = (pipRes.data || []) as Array<{
    start_date: string; end_date: string | null; reason: string | null; status: string | null;
  }>;
  const relevantPip = pipRows.find(
    (p) =>
      p.status === "active" ||
      (p.start_date <= endISO && (p.end_date == null || p.end_date >= startISO)),
  );

  const modules: CompiledMetrics["modules"] = {};

  const assignments = (assignmentsRes.data || []) as Array<{
    client_id: string | null;
    status: string | null;
    meeting_target: number | null;
    meetings_completed: number | null;
    started_at: string | null;
    ends_at: string | null;
    client_profiles: { company_name: string | null } | null;
  }>;
  const relevantAssignments = assignments.filter(
    (a) =>
      a.status === "active" ||
      ((a.started_at ?? "") <= `${endISO}T23:59:59` &&
        (a.ends_at == null || a.ends_at >= `${startISO}T00:00:00`)),
  );
  if (relevantAssignments.length > 0) {
    const bookedByClient = new Map<string, number>();
    for (const m of splitByCreated(meetingsByCreated, startISO, endISO)) {
      if (m.client_profile_id) {
        bookedByClient.set(m.client_profile_id, (bookedByClient.get(m.client_profile_id) || 0) + 1);
      }
    }
    const satByClient = new Map<string, number>();
    for (const m of cur.meetingsSatPopulation.filter(isMeetingSat)) {
      if (m.client_profile_id) {
        satByClient.set(m.client_profile_id, (satByClient.get(m.client_profile_id) || 0) + 1);
      }
    }
    modules.per_client = relevantAssignments.map((a) => ({
      client: a.client_profiles?.company_name ?? "Unknown client",
      assignment_status: a.status ?? "unknown",
      meeting_target: a.meeting_target,
      meetings_completed: a.meetings_completed,
      booked_in_period: a.client_id ? bookedByClient.get(a.client_id) || 0 : 0,
      sat_in_period: a.client_id ? satByClient.get(a.client_id) || 0 : 0,
    }));
  }

  const callScores = (callScoresRes?.data || []) as Array<{
    call_date: string; weighted_total: number | null; performance_rating: string | null;
    mandatory_gates_passed: boolean | null;
  }>;
  const curScores = callScores.filter((c) => inDateRange(c.call_date, startISO, endISO));
  const prevScores = hasPrior
    ? callScores.filter((c) =>
        inDateRange(c.call_date, window.priorStartISO as string, window.priorEndISO as string),
      )
    : [];
  if (curScores.length > 0 || prevScores.length > 0) {
    const ratingCounts: Record<string, number> = {};
    for (const s of curScores) {
      const r = s.performance_rating ?? "unrated";
      ratingCounts[r] = (ratingCounts[r] || 0) + 1;
    }
    modules.call_qa = {
      calls_scored: curScores.length,
      avg_weighted_total: round1(avgOf(curScores.map((s) => Number(s.weighted_total)).filter((n) => !isNaN(n)))),
      gates_passed: curScores.filter((s) => s.mandatory_gates_passed === true).length,
      gates_failed: curScores.filter((s) => s.mandatory_gates_passed === false).length,
      rating_counts: ratingCounts,
      prior: {
        calls_scored: prevScores.length,
        avg_weighted_total: round1(avgOf(prevScores.map((s) => Number(s.weighted_total)).filter((n) => !isNaN(n)))),
      },
    };
  }

  // Appointment scores (CSM-entered) attach to meetings via appointment_id.
  const meetingIds = [...new Set(meetingsByDate.map((m) => m.id))];
  if (meetingIds.length > 0) {
    const { data: scoreRows } = await supabase
      .from("meeting_scores")
      .select("appointment_id, fit, engagement, authority, next_step, overall_quality")
      .in("appointment_id", meetingIds);
    const scores = (scoreRows || []) as Array<{
      appointment_id: string | null; fit: number; engagement: number; authority: number;
      next_step: number; overall_quality: number;
    }>;
    if (scores.length > 0) {
      const curIds = new Set(cur.meetingsSatPopulation.map((m) => m.id));
      const curScored = scores.filter((s) => s.appointment_id && curIds.has(s.appointment_id));
      const prevScored = scores.filter((s) => s.appointment_id && !curIds.has(s.appointment_id));
      modules.appointment_scores = {
        meetings_scored: curScored.length,
        avg_overall_quality: round1(avgOf(curScored.map((s) => Number(s.overall_quality)))),
        // House threshold: overall_quality >= 4 counts as a quality meeting.
        quality_meetings: curScored.filter((s) => Number(s.overall_quality) >= 4).length,
        avg_fit: round1(avgOf(curScored.map((s) => Number(s.fit)))),
        avg_engagement: round1(avgOf(curScored.map((s) => Number(s.engagement)))),
        avg_authority: round1(avgOf(curScored.map((s) => Number(s.authority)))),
        avg_next_step: round1(avgOf(curScored.map((s) => Number(s.next_step)))),
        prior: {
          meetings_scored: prevScored.length,
          avg_overall_quality: round1(avgOf(prevScored.map((s) => Number(s.overall_quality)))),
        },
      };
    }
  }

  const fullName = (setter.full_name || setter.email || "Unknown").trim();

  return {
    version: 2,
    setter: {
      first_name: fullName.split(" ")[0],
      full_name: fullName,
      department: setter.department,
    },
    window: {
      kind: window.kind,
      start: startISO,
      end: endISO,
      label: window.label,
      days_worked: cur.daysWorked,
      days_worked_source: "attendance",
      ...(override && adjustedMetrics.length > 0
        ? {
            adjusted: {
              metrics: adjustedMetrics,
              computed: computedCur,
              by: adjustedBy,
              at: override.set_at,
              reason: override.reason,
            },
          }
        : {}),
      ...(hasPrior && prev
        ? {
            prior: {
              start: window.priorStartISO as string,
              end: window.priorEndISO as string,
              label: window.priorLabel as string,
              days_worked: prev.daysWorked,
            },
          }
        : {}),
    },
    totals,
    rates,
    daily,
    suppositions,
    ...(highlights.strongest_day || highlights.least_active_day ? { highlights } : {}),
    targets: {
      daily_dials: targets.daily_dials_target,
      daily_meetings: targets.daily_meetings_target,
      daily_talk_minutes: targets.daily_talk_time_target,
      weekly_meetings: targets.weekly_meetings_target,
      ...(monthlyMeetingsTarget != null
        ? {
            monthly_meetings: monthlyMeetingsTarget,
            monthly_meetings_source: (typedGoal != null ? "typed_goal" : "weekly_target_x4") as
              | "typed_goal"
              | "weekly_target_x4",
          }
        : {}),
    },
    coaching: {
      sessions_in_period: coachingInPeriod.length,
      last_session_date: lastSession?.session_date ?? null,
      session_types_in_period: [
        ...new Set(coachingInPeriod.map((c) => c.session_type).filter(Boolean) as string[]),
      ],
      current_focus: setter.current_coaching_focus,
    },
    pip: relevantPip
      ? {
          active: relevantPip.status === "active",
          start_date: relevantPip.start_date,
          reason: relevantPip.reason ?? undefined,
          status: relevantPip.status ?? undefined,
        }
      : { active: false },
    modules,
  };
}

export interface PerformanceReviewRow {
  id: string;
  reviewee_user_id: string;
  role: string;
  department: string | null;
  period_start: string;
  period_end: string;
  created_by: string;
  compiled_metrics: CompiledMetrics;
  status: "draft" | "generating" | "complete" | "failed";
  created_at: string;
}

export interface ReviewBriefRow {
  id: string;
  review_id: string;
  brief: {
    strengths?: string[];
    gaps_vs_target?: string[];
    what_moved?: { summary?: string; likely_why?: string };
    focus_areas?: string[];
  } | null;
  model: string | null;
  status: "generating" | "complete" | "failed";
  error: string | null;
  created_at: string;
}

/** Reviews for one setter + exact window (newest first). Empty pre-migration. */
export function useSetterReviews(
  setterUserId: string | undefined,
  periodStartISO: string,
  periodEndISO: string,
) {
  return useQuery({
    queryKey: ["performance-reviews", setterUserId, periodStartISO, periodEndISO],
    enabled: !!setterUserId,
    queryFn: async (): Promise<PerformanceReviewRow[]> => {
      const { data, error } = await db
        .from("performance_reviews")
        .select("*")
        .eq("reviewee_user_id", setterUserId)
        .eq("period_start", periodStartISO)
        .eq("period_end", periodEndISO)
        .order("created_at", { ascending: false })
        .limit(5);
      // Graceful pre-migration degradation: table missing → behave as empty.
      if (error) return [];
      return (data || []) as PerformanceReviewRow[];
    },
  });
}

export function useReviewBrief(reviewId: string | undefined) {
  return useQuery({
    queryKey: ["performance-review-brief", reviewId],
    enabled: !!reviewId,
    queryFn: async (): Promise<ReviewBriefRow | null> => {
      const { data, error } = await db
        .from("performance_review_briefs")
        .select("*")
        .eq("review_id", reviewId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return (data as ReviewBriefRow) ?? null;
    },
  });
}

/**
 * Compile + persist + kick off the AI narrative. Returns the review id.
 * Throws with a friendly message pre-migration (guarded insert — the house
 * degrade-gracefully pattern).
 */
export async function generateSetterReview(
  setter: ReviewSetter,
  window: ResolvedReviewWindow,
): Promise<string> {
  const compiled = await compileSetterReviewMetrics(setter, window);
  return createReviewAndStartNarrative({
    revieweeUserId: setter.user_id,
    role: "setter",
    department: setter.department,
    periodStart: compiled.window.start,
    periodEnd: compiled.window.end,
    compiled,
  });
}
