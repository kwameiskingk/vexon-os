import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { pctDelta } from "@/lib/metrics/setterMetrics";
import { fetchManagerTeam, fetchWindowNumbers, type TeamSetter } from "@/lib/metrics/managerTeamWindow";
import { resolveTargetsForRole } from "@/lib/targets/resolveTargets";
import { createReviewAndStartNarrative } from "@/hooks/reviewEngine";
import type { ResolvedReviewWindow } from "@/hooks/useSetterReview";

// Escape hatch for tables newer than the generated types (house pattern).
const db: SupabaseClient = supabase;

/**
 * SDR Manager Monthly Performance Review — compile layer (Batch C, 2026-07-28).
 *
 * TWO DISTINCT GROUPS, never merged (ruling 2026-07-28):
 * - personal: the manager's own delivery — coaching sessions they personally
 *   ran (status='completed' only; a scheduled session is not delivery).
 * - team: the combined performance of their CURRENTLY-assigned setters.
 *   Historical windows are scored against today's roster (snapshot
 *   semantics — assignments carry no history; consistent with the
 *   team-size-snapshot ruling on targets).
 *
 * Team numbers use the SHARED setterMetrics implementations (isMeetingSat,
 * computeSitRatePct, daysWorkedFromAttendance, safeRatio) — no formulas
 * re-derived inline. Aggregation re-applies the test-account and
 * setter-role gates (the useReviewSetters rule for cross-setter aggregates).
 *
 * Per-setter averages (headcount-independent, grain split is law):
 * - dials + talk: window total ÷ setter-days-worked (attendance: present/
 *   late = 1, half_day = 0.5, summed across the team). Null when no
 *   attendance is marked — never a calendar fallback.
 * - booked: window total ÷ team size ÷ weeks (calendar days ÷ 7).
 */

export interface ReviewManager {
  user_id: string;
  full_name: string | null;
  email: string | null;
  departments: string[];
}

export function useReviewManagers() {
  return useQuery({
    queryKey: ["performance-review-sdr-managers"],
    queryFn: async (): Promise<ReviewManager[]> => {
      const { data: roleRows, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "sdr_manager");
      if (rolesError) throw rolesError;
      const userIds = (roleRows ?? []).map((r) => r.user_id);
      if (userIds.length === 0) return [];
      const [{ data: profiles, error: profilesError }, { data: assignments }] = await Promise.all([
        // Leavers never appear as reviewable managers (one leaver rule, 13 Oct).
        supabase.from("profiles").select("id, full_name, email").in("id", userIds).is("offboarded_at" as never, null).order("full_name"),
        db.from("sdr_manager_assignments").select("manager_user_id, department").in("manager_user_id", userIds),
      ]);
      if (profilesError) throw profilesError;
      const deptsByManager = new Map<string, Set<string>>();
      for (const a of (assignments ?? []) as { manager_user_id: string; department: string | null }[]) {
        if (!a.department) continue;
        const set = deptsByManager.get(a.manager_user_id) ?? new Set<string>();
        set.add(a.department);
        deptsByManager.set(a.manager_user_id, set);
      }
      return (profiles ?? []).map((p) => ({
        user_id: p.id,
        full_name: p.full_name,
        email: p.email,
        departments: [...(deptsByManager.get(p.id) ?? [])],
      }));
    },
  });
}

export interface ManagerMetricValue {
  actual: number | null;
  prior: number | null;
  delta_pct: number | null;
  target: number | null;
  target_period: "day" | "week" | "month" | null;
  note?: string;
}

export interface SdrManagerCompiledMetrics {
  version: 1;
  role: "sdr_manager";
  subject: {
    first_name: string;
    full_name: string;
    departments: string[];
  };
  window: {
    kind: ResolvedReviewWindow["kind"];
    start: string;
    end: string;
    label: string;
    prior?: { start: string; end: string; label: string };
  };
  /** The manager's OWN delivery. */
  personal: Record<string, ManagerMetricValue>;
  /** The currently-assigned team's combined performance. */
  team: {
    team_size: number;
    roster_note: string;
    metrics: Record<string, ManagerMetricValue>;
  };
}

const round1 = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10);

export async function compileSdrManagerReviewMetrics(
  manager: ReviewManager,
  window: ResolvedReviewWindow,
): Promise<SdrManagerCompiledMetrics> {
  // The review engine compiles one department per manager (departments[0],
  // matching the target resolution below) — managerTeamWindow now REQUIRES a
  // department so the roster and sums can never silently merge departments.
  const reviewDepartment =
    (manager.departments[0] as "fulfilment" | "acquisition" | undefined) ?? "fulfilment";
  const team: TeamSetter[] = await fetchManagerTeam(manager.user_id, reviewDepartment);

  const metricNames = [
    "coaching_sessions",
    "team_booked",
    "team_sat",
    "team_sat_rate_pct",
    "team_avg_dials_per_setter_day",
    "team_avg_talk_minutes_per_setter_day",
    "team_avg_booked_per_setter_week",
  ];
  const [current, prior, targetsBySubject] = await Promise.all([
    fetchWindowNumbers(manager.user_id, team, window.startISO, window.endISO, reviewDepartment),
    (window.kind === "month" || window.kind === "week") && window.priorStartISO && window.priorEndISO
      ? fetchWindowNumbers(manager.user_id, team, window.priorStartISO, window.priorEndISO, reviewDepartment)
      : Promise.resolve(null),
    resolveTargetsForRole([manager.user_id], "sdr_manager", reviewDepartment, window.endISO, metricNames),
  ]);

  const targets = targetsBySubject.get(manager.user_id) ?? {};

  const metricValue = (
    metric: string,
    actual: number | null,
    priorValue: number | null,
    note?: string,
  ): ManagerMetricValue => {
    const resolved = targets[metric];
    const target = resolved && resolved.kind === "target" ? resolved.value : null;
    const targetPeriod = resolved && resolved.kind === "target" ? resolved.period : null;
    return {
      actual: round1(actual),
      prior: round1(priorValue),
      delta_pct:
        actual !== null && priorValue !== null && priorValue > 0
          ? round1(pctDelta(actual, priorValue))
          : null,
      target,
      target_period: targetPeriod,
      ...(note ? { note } : {}),
    };
  };

  const fullName = (manager.full_name || manager.email || "Unknown").trim();
  const noCloseNote =
    current.avgDialsPerSetterDay === null
      ? "Not yet computable — needs Close-linked setters AND marked attendance in the window."
      : undefined;

  return {
    version: 1,
    role: "sdr_manager",
    subject: {
      first_name: fullName.split(/\s+/)[0],
      full_name: fullName,
      departments: manager.departments,
    },
    window: {
      kind: window.kind,
      start: window.startISO,
      end: window.endISO,
      label: window.label,
      ...((window.kind === "month" || window.kind === "week") && window.priorStartISO && window.priorEndISO
        ? {
            prior: {
              start: window.priorStartISO,
              end: window.priorEndISO,
              label: window.priorLabel || "prior period",
            },
          }
        : {}),
    },
    personal: {
      coaching_sessions: metricValue(
        "coaching_sessions",
        current.coachingCompleted,
        prior?.coachingCompleted ?? null,
        "Completed sessions only — scheduled sessions are not counted.",
      ),
    },
    team: {
      team_size: team.length,
      roster_note:
        "Team numbers cover the manager's CURRENTLY-assigned setters; historical windows are scored against today's roster.",
      metrics: {
        team_booked: metricValue("team_booked", current.booked, prior?.booked ?? null),
        team_sat: metricValue("team_sat", current.sat, prior?.sat ?? null),
        team_sat_rate_pct: metricValue(
          "team_sat_rate_pct",
          current.satRatePct,
          prior?.satRatePct ?? null,
        ),
        team_avg_dials_per_setter_day: metricValue(
          "team_avg_dials_per_setter_day",
          current.avgDialsPerSetterDay,
          prior?.avgDialsPerSetterDay ?? null,
          noCloseNote,
        ),
        team_avg_talk_minutes_per_setter_day: metricValue(
          "team_avg_talk_minutes_per_setter_day",
          current.avgTalkMinutesPerSetterDay,
          prior?.avgTalkMinutesPerSetterDay ?? null,
          noCloseNote,
        ),
        team_avg_booked_per_setter_week: metricValue(
          "team_avg_booked_per_setter_week",
          current.avgBookedPerSetterWeek,
          prior?.avgBookedPerSetterWeek ?? null,
        ),
      },
    },
  };
}

/** Compile + persist + kick off the AI narrative. Returns the review id. */
export async function generateSdrManagerReview(
  manager: ReviewManager,
  window: ResolvedReviewWindow,
): Promise<string> {
  const compiled = await compileSdrManagerReviewMetrics(manager, window);
  return createReviewAndStartNarrative({
    revieweeUserId: manager.user_id,
    role: "sdr_manager",
    department: manager.departments[0] ?? null,
    periodStart: compiled.window.start,
    periodEnd: compiled.window.end,
    compiled,
  });
}
