import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  daysWorkedFromAttendance,
  pctDelta,
  type AttendanceStatusRow,
} from "@/lib/metrics/setterMetrics";
import { ROLE_METRIC_SETS, resolveTargetsForRole } from "@/lib/targets/resolveTargets";
import { createReviewAndStartNarrative } from "@/hooks/reviewEngine";
import type { ResolvedReviewWindow } from "@/hooks/useSetterReview";
import { fetchActiveAeUserIds } from "@/lib/aeRoster";

// Escape hatch for tables newer than the generated types (house pattern).
const db: SupabaseClient = supabase;

/**
 * AE Monthly Performance Review — compile layer (Batch B, 2026-07-28).
 *
 * Same spine as the setter review: compile finished figures client-side,
 * persist via createReviewAndStartNarrative, narrative via the edge
 * function's account_executive prompt. Targets come from the RESOLVER
 * (individual_targets / role_target_defaults) — never legacy setter_targets.
 *
 * Honesty rules (approved 2026-07-28):
 * - cold_calls: NO capture mechanism is defined yet (a cold call is a
 *   subset of dials — do NOT count every dial). Actual is null with a
 *   pending note until the definition ruling lands.
 * - reengaged_meetings: the flow exists (meetings.is_pipeline_reengagement)
 *   but has zero real rows ever — actual is null with a pending note until
 *   adoption. Both are tracked separately; neither blocks this engine.
 * - talk_minutes: real only when the AE's Close ID is linked; otherwise
 *   null with a pending note. Never a fake zero.
 * - deals_closed / cash_collected read the Mark-as-Won trail (pitch_calls /
 *   ae_deal_payments) — genuine zeros are honest there. Cash is GBP.
 */

export interface ReviewAE {
  user_id: string;
  full_name: string | null;
  email: string | null;
  close_user_id: string | null;
  active: boolean | null;
  is_test_account: boolean | null;
}

export function useReviewAEs() {
  return useQuery({
    queryKey: ["performance-review-aes"],
    queryFn: async (): Promise<ReviewAE[]> => {
      // Shared roster: role-holders + acting AEs (Marcus), minus offboarded.
      const userIds = await fetchActiveAeUserIds();
      if (userIds.length === 0) return [];
      const [{ data: profiles, error: profilesError }, { data: setterRows }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").in("id", userIds).order("full_name"),
        supabase.from("setters_profiles").select("user_id, close_user_id, active, is_test_account").in("user_id", userIds),
      ]);
      if (profilesError) throw profilesError;
      const profileByUser = new Map(
        (setterRows ?? []).map((r) => [String(r.user_id), r]),
      );
      return (profiles ?? []).map((p) => {
        const sp = profileByUser.get(String(p.id));
        return {
          user_id: p.id,
          full_name: p.full_name,
          email: p.email,
          close_user_id: sp?.close_user_id ?? null,
          active: sp?.active ?? null,
          is_test_account: sp?.is_test_account ?? null,
        };
      });
    },
  });
}

export interface AEMetricValue {
  actual: number | null;
  prior: number | null;
  delta_pct: number | null;
  target: number | null;
  target_period: "day" | "week" | "month" | null;
  /** Present only when actual is null — WHY there is no number yet. */
  pending_note?: string;
}

export interface AECompiledMetrics {
  version: 1;
  role: "account_executive";
  subject: {
    first_name: string;
    full_name: string;
    email: string | null;
    close_linked: boolean;
  };
  currency: "GBP";
  window: {
    kind: ResolvedReviewWindow["kind"];
    start: string;
    end: string;
    label: string;
    days_worked: number;
    days_worked_source: "attendance";
    prior?: { start: string; end: string; label: string };
  };
  metrics: Record<string, AEMetricValue>;
}

const PENDING_NOTES: Record<string, string> = {
  cold_calls:
    "Not yet tracked — cold-call capture is undefined (a cold call is a subset of dials; counting every dial would overstate).",
  reengaged_meetings:
    "Not yet tracked — the re-engagement flag exists in the app but has never been used.",
  talk_minutes: "Not yet tracked — no Close ID is linked for this AE yet.",
};

interface WindowActuals {
  deals_closed: number;
  cash_collected: number;
  talk_minutes: number | null;
}

async function fetchAEActuals(
  ae: ReviewAE,
  startISO: string,
  endISO: string,
): Promise<WindowActuals> {
  const [dealsRes, cashRes, closeRes] = await Promise.all([
    db
      .from("pitch_calls")
      .select("id")
      .eq("created_by", ae.user_id)
      .gte("closed_on", startISO)
      .lte("closed_on", endISO),
    db
      .from("ae_deal_payments")
      .select("amount")
      .eq("ae_user_id", ae.user_id)
      .gte("paid_on", startISO)
      .lte("paid_on", endISO),
    ae.close_user_id
      ? db
          .from("setter_close_metrics")
          .select("talk_time_seconds")
          .eq("close_user_id", ae.close_user_id)
          .gte("date", startISO)
          .lte("date", endISO)
      : Promise.resolve({ data: null, error: null } as { data: null; error: null }),
  ]);

  const cash = (cashRes.data ?? []).reduce(
    (sum: number, r: { amount: number | null }) => sum + (Number(r.amount) || 0),
    0,
  );
  const talkMinutes = ae.close_user_id
    ? Math.round(
        ((closeRes.data ?? []) as { talk_time_seconds: number | null }[]).reduce(
          (sum, r) => sum + (Number(r.talk_time_seconds) || 0),
          0,
        ) / 60,
      )
    : null;

  return {
    deals_closed: (dealsRes.data ?? []).length,
    cash_collected: cash,
    talk_minutes: talkMinutes,
  };
}

export async function compileAEReviewMetrics(
  ae: ReviewAE,
  window: ResolvedReviewWindow,
): Promise<AECompiledMetrics> {
  const metricNames = ROLE_METRIC_SETS.account_executive;

  const [actuals, priorActuals, attendanceRes, targetsBySubject] = await Promise.all([
    fetchAEActuals(ae, window.startISO, window.endISO),
    (window.kind === "month" || window.kind === "week") && window.priorStartISO && window.priorEndISO
      ? fetchAEActuals(ae, window.priorStartISO, window.priorEndISO)
      : Promise.resolve(null),
    supabase
      .from("employee_attendance")
      .select("date, status")
      .eq("employee_id", ae.user_id)
      .gte("date", window.startISO)
      .lte("date", window.endISO),
    resolveTargetsForRole([ae.user_id], "account_executive", "sales", window.endISO, metricNames),
  ]);

  const targets = targetsBySubject.get(ae.user_id) ?? {};
  const daysWorked = daysWorkedFromAttendance(
    ((attendanceRes.data ?? []) as AttendanceStatusRow[]) || [],
  );

  const metricValue = (metric: string, actual: number | null, prior: number | null): AEMetricValue => {
    const resolved = targets[metric];
    const target = resolved && resolved.kind === "target" ? resolved.value : null;
    const targetPeriod = resolved && resolved.kind === "target" ? resolved.period : null;
    return {
      actual,
      prior,
      delta_pct: actual !== null && prior !== null ? pctDelta(actual, prior) : null,
      target,
      target_period: targetPeriod,
      ...(actual === null && PENDING_NOTES[metric] ? { pending_note: PENDING_NOTES[metric] } : {}),
    };
  };

  const fullName = (ae.full_name || ae.email || "Unknown").trim();

  return {
    version: 1,
    role: "account_executive",
    subject: {
      first_name: fullName.split(/\s+/)[0],
      full_name: fullName,
      email: ae.email,
      close_linked: !!ae.close_user_id,
    },
    currency: "GBP",
    window: {
      kind: window.kind,
      start: window.startISO,
      end: window.endISO,
      label: window.label,
      days_worked: daysWorked,
      days_worked_source: "attendance",
      ...(window.kind === "month" && window.priorStartISO && window.priorEndISO
        ? {
            prior: {
              start: window.priorStartISO,
              end: window.priorEndISO,
              label: window.priorLabel || "prior month",
            },
          }
        : {}),
    },
    metrics: {
      deals_closed: metricValue("deals_closed", actuals.deals_closed, priorActuals?.deals_closed ?? null),
      cash_collected: metricValue(
        "cash_collected",
        actuals.cash_collected,
        priorActuals?.cash_collected ?? null,
      ),
      cold_calls: metricValue("cold_calls", null, null),
      talk_minutes: metricValue("talk_minutes", actuals.talk_minutes, priorActuals?.talk_minutes ?? null),
      reengaged_meetings: metricValue("reengaged_meetings", null, null),
    },
  };
}

/** Compile + persist + kick off the AI narrative. Returns the review id. */
export async function generateAEReview(ae: ReviewAE, window: ResolvedReviewWindow): Promise<string> {
  const compiled = await compileAEReviewMetrics(ae, window);
  return createReviewAndStartNarrative({
    revieweeUserId: ae.user_id,
    role: "account_executive",
    department: "sales",
    periodStart: compiled.window.start,
    periodEnd: compiled.window.end,
    compiled,
  });
}
