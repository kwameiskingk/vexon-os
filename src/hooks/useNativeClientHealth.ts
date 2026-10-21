import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  ClientHealthSnapshotRow,
  HealthStatus,
  MetricOverrideInfo,
  OverridableMetric,
} from "@/lib/clientHealthSnapshot";
import {
  hasNativeClientFeedback,
  latestOpportunitiesForClient,
  latestVacanciesForClient,
  potentialRevenueForClient,
  type CatchupFeedbackRow,
  type OpeningBalanceRow,
} from "@/lib/clientFeedback";

export interface NativeClientHealthResult {
  rows: ClientHealthSnapshotRow[];
  /** Native sources that errored (usually: migration not applied yet). */
  sourcesUnavailable: string[];
}

/**
 * The sheet's health rule (Rubric tab / Dashboard column M), ported EXACTLY
 * including its quirks — days remaining, revenue, opportunities and
 * vacancies are NOT inputs:
 *
 *   =IF(OR(A5="",I5="",H5=0,H5=""),"",
 *     IF(AND(J5>=0.7,OR(K5="",K5>=3.5)),"🟢 Healthy",
 *       IF(OR(J5>=0.5,AND(ISNUMBER(K5),K5>=2.5)),"🟡 Watch","🔴 At Risk")))
 *
 *   A = client name · H = booked · I = sat · J = show-up · K = avg quality
 */
export function computeSheetRuleHealth(
  clientName: string | null,
  booked: number | null,
  sat: number | null,
  showUpRate: number | null,
  avgQuality: number | null,
): HealthStatus {
  if (!clientName || sat == null || booked == null || booked === 0) return null;
  if (showUpRate != null && showUpRate >= 0.7 && (avgQuality == null || avgQuality >= 3.5))
    return "green";
  if ((showUpRate != null && showUpRate >= 0.5) || (avgQuality != null && avgQuality >= 2.5))
    return "amber";
  return "red";
}

/**
 * Computes client-health rows from native platform data in the EXACT shape
 * the Google Sheet snapshot returns (ClientHealthSnapshotRow).
 *
 * SOURCE OF TRUTH since the source flip: health = computeSheetRuleHealth
 * over native booked/sat/quality, with the manual health_override winning
 * outright ('healthy' → green, 'at_risk' → red) — same precedence the
 * sheet's manual column had. The sheet snapshot remains available only as
 * the parity-page reference until its sync is retired.
 *
 * Sources: client_profiles (roster, campaign_end_date, health_override),
 * meetings by client_profile_id (booked/sat/show-up), meeting_scores
 * (avg quality all-time, quality 4+), catch-up feedback + opening balances
 * (vacancies / potential revenue / opportunities via clientFeedback.ts).
 */
async function computeNativeRows(): Promise<NativeClientHealthResult> {
  const sourcesUnavailable: string[] = [];

  // select("*") throughout keeps this resilient to not-yet-migrated
  // columns (campaign_end_date, catch-up feedback fields): absent
  // columns simply arrive as undefined instead of failing the query.
  const [profilesRes, meetingsRes, scoresRes, catchupsRes, openingsRes, overridesRes] =
    await Promise.all([
      supabase.from("client_profiles").select("*"),
      supabase
        .from("meetings")
        .select(
          "id, client_profile_id, department, is_rebook, attendance_status, attendance_confirmed, meeting_date",
        )
        .eq("department", "fulfilment")
        .not("client_profile_id", "is", null),
      supabase
        .from("meeting_scores")
        .select("appointment_id, overall_quality, matched")
        .eq("matched", true),
      supabase.from("client_catchups").select("*"),
      supabase.from("client_health_opening_balances").select("*"),
      supabase.from("client_health_metric_overrides" as never).select("*"),
    ]);

  if (profilesRes.error) throw profilesRes.error; // roster is mandatory
  if (meetingsRes.error) sourcesUnavailable.push("meetings");
  if (scoresRes.error) sourcesUnavailable.push("meeting_scores");
  if (catchupsRes.error) sourcesUnavailable.push("client_catchups");
  if (openingsRes.error) sourcesUnavailable.push("client_health_opening_balances");
  if (overridesRes.error) sourcesUnavailable.push("client_health_metric_overrides");

  // select("*") means is_test_account simply arrives once the 2026-08-26
  // migration lands; before that it's undefined and nothing is filtered.
  const profiles = ((profilesRes.data ?? []) as Record<string, unknown>[])
    .filter((p) => p.is_test_account !== true);
  const meetings = (meetingsRes.data ?? []) as Record<string, unknown>[];
  const scores = (scoresRes.data ?? []) as Record<string, unknown>[];
  const catchups = (catchupsRes.data ?? []) as unknown as CatchupFeedbackRow[];
  const openings = (openingsRes.data ?? []) as unknown as OpeningBalanceRow[];
  const overrideRows = (overridesRes.data ?? []) as unknown as Record<string, unknown>[];

  // client id → metric → override. An override row existing IS the override
  // (presence = intent, same convention as resolveTargets.ts).
  const overridesByClient = new Map<string, Partial<Record<OverridableMetric, MetricOverrideInfo>>>();
  overrideRows.forEach((o) => {
    const clientId = String(o.client_profile_id ?? "");
    const metric = String(o.metric ?? "") as OverridableMetric;
    const value = Number(o.value);
    if (!clientId || !metric || !Number.isFinite(value)) return;
    const forClient = overridesByClient.get(clientId) ?? {};
    forClient[metric] = {
      value,
      affectsHealth: o.affects_health === true,
      setBy: o.set_by ? String(o.set_by) : null,
      setAt: o.set_at ? String(o.set_at) : null,
    };
    overridesByClient.set(clientId, forClient);
  });

  const feedbackLive = hasNativeClientFeedback(catchups, openings);

  // meeting id → client, then score → client
  const meetingClient = new Map<string, string>();
  meetings.forEach((m) => {
    if (m.id && m.client_profile_id) {
      meetingClient.set(String(m.id), String(m.client_profile_id));
    }
  });
  const scoresByClient = new Map<string, number[]>();
  scores.forEach((s) => {
    const clientId = s.appointment_id
      ? meetingClient.get(String(s.appointment_id))
      : undefined;
    const quality = Number(s.overall_quality);
    if (!clientId || !Number.isFinite(quality)) return;
    const list = scoresByClient.get(clientId) ?? [];
    list.push(quality);
    scoresByClient.set(clientId, list);
  });

  const isSat = (m: Record<string, unknown>) =>
    m.attendance_confirmed === true || m.attendance_status === "sat";

  const today = Date.now();
  const openingFor = (id: string) =>
    openings.find((o) => String(o.client_profile_id) === id) as
      | (OpeningBalanceRow & { opening_booked?: number | null; opening_sat?: number | null })
      | undefined;

  const rows: ClientHealthSnapshotRow[] = profiles
    .filter((p) => String(p.status ?? "") === "active")
    .map((p) => {
      const id = String(p.id);
      // Health "booked" (the owner rulings, 2026-07-15):
      //  1. only meetings that have come due (meeting_date <= today) — a
      //     future booking cannot be a missed one (matches W19: show-up is
      //     judged on meeting-date);
      //  2. rescheduled rows don't count — the meeting moved, its
      //     replacement row is the one that gets judged;
      //  3. rebooks ARE counted here. This is a DELIBERATE divergence from
      //     the platform-wide "is_rebook excluded from leaderboards" rule:
      //     that rule prevents setter commission double-claiming, but a sat
      //     rebook is a real meeting the client really attended (and the
      //     sheet counts it). Do not "fix" this to match the leaderboards.
      const clientMeetings = meetings.filter((m) => {
        if (String(m.client_profile_id) !== id) return false;
        if (m.attendance_status === "rescheduled") return false;
        const due = Date.parse(String(m.meeting_date ?? ""));
        return Number.isFinite(due) && due <= today;
      });
      // Pre-app history preserved as offsets (opening_booked/opening_sat =
      // sheet total at seed time minus platform count at seed time).
      const opening = openingFor(id);
      const openingBooked = Number(opening?.opening_booked ?? 0) || 0;
      const openingSat = Number(opening?.opening_sat ?? 0) || 0;
      const booked = openingBooked + clientMeetings.length;
      const sat = openingSat + clientMeetings.filter(isSat).length;
      const qualities = scoresByClient.get(id) ?? [];
      const avgQuality =
        qualities.length > 0
          ? qualities.reduce((s, n) => s + n, 0) / qualities.length
          : null;

      const endRaw = p.campaign_end_date ? String(p.campaign_end_date) : null;
      const endTime = endRaw ? Date.parse(endRaw) : NaN;
      const daysRemaining = Number.isFinite(endTime)
        ? Math.ceil((endTime - today) / 86_400_000)
        : null;

      const meetingsBooked = meetingsRes.error ? null : booked;
      const meetingsSat = meetingsRes.error ? null : sat;
      const showUpRate = !meetingsRes.error && booked > 0 ? sat / booked : null;

      const revenueGenerated = feedbackLive
        ? potentialRevenueForClient(id, catchups, openings)
        : null;
      const opportunities = feedbackLive
        ? latestOpportunitiesForClient(id, catchups, openings)
        : null;
      const vacancies = feedbackLive
        ? latestVacanciesForClient(id, catchups, openings)
        : null;

      // Manual metric overrides (Stage 2). Two resolutions from one row set:
      //  - display: EVERY override wins over its computed value;
      //  - health:  only affects_health overrides feed the band/rationale —
      //    display-only overrides change the tiles, never the band.
      // Show-up rate is never stored; it re-derives from the resolved
      // booked/sat in each resolution.
      const ov = overridesByClient.get(id) ?? {};
      const displayBooked = ov.meetings_booked?.value ?? meetingsBooked;
      const displaySat = ov.meetings_sat?.value ?? meetingsSat;
      const displayShowUp =
        displayBooked != null && displayBooked > 0 && displaySat != null
          ? displaySat / displayBooked
          : null;
      const healthBooked = ov.meetings_booked?.affectsHealth
        ? ov.meetings_booked.value
        : meetingsBooked;
      const healthSat = ov.meetings_sat?.affectsHealth
        ? ov.meetings_sat.value
        : meetingsSat;
      const healthShowUp =
        healthBooked != null && healthBooked > 0 && healthSat != null
          ? healthSat / healthBooked
          : null;

      // Manual band override wins outright — same precedence as today.
      const override = p.health_override ? String(p.health_override) : null;
      const healthStatus: HealthStatus =
        override === "healthy"
          ? "green"
          : override === "at_risk"
            ? "red"
            : computeSheetRuleHealth(
                String(p.company_name ?? ""),
                healthBooked,
                healthSat,
                healthShowUp,
                avgQuality,
              );

      return {
        clientName: String(p.company_name ?? ""),
        status: p.status == null ? null : String(p.status),
        campaignEndDate: endRaw,
        daysRemaining: ov.days_remaining?.value ?? daysRemaining,
        revenueGenerated: ov.revenue?.value ?? revenueGenerated,
        opportunities: ov.opportunities?.value ?? opportunities,
        vacancies: ov.vacancies?.value ?? vacancies,
        meetingsBooked: displayBooked,
        meetingsSat: displaySat,
        showUpRate: displayShowUp,
        avgMeetingQuality: avgQuality,
        qualityMeetings: scoresRes.error
          ? null
          : qualities.filter((q) => q >= 4).length,
        healthStatus,
        notes: null,
        matched: true,
        clientProfileId: id,
        overrides: ov,
        computed: {
          meetingsBooked,
          meetingsSat,
          showUpRate,
          revenueGenerated,
          opportunities,
          vacancies,
          daysRemaining,
        },
      };
    });

  return { rows, sourcesUnavailable };
}

export function useNativeClientHealth(enabled = true) {
  return useQuery({
    queryKey: ["native-client-health"],
    enabled,
    staleTime: 60_000,
    queryFn: computeNativeRows,
  });
}

const FIVE_MIN = 5 * 60 * 1000;

/**
 * Drop-in replacement for useClientHealthSnapshot: identical response shape
 * ({ rows, fetchedAt, sheetName }), computed natively. The sheet hook
 * remains only for the parity page (reference column) and the
 * opening-balances seed tool.
 */
export function useClientHealth() {
  return useQuery({
    queryKey: ["native-client-health", "primary"],
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: FIVE_MIN,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { rows, sourcesUnavailable } = await computeNativeRows();
      return {
        rows,
        sourcesUnavailable,
        fetchedAt: new Date().toISOString(),
        sheetName: "Vexon OS (native)",
      };
    },
  });
}
