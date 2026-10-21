import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { getUniqueConvertedDeals, sumConvertedDealValue } from "@/lib/convertedDeals";
import { computeSitRatePct, isMeetingSat } from "@/lib/metrics/setterMetrics";
import { getConsecutiveStreak, type WeeklyGoal } from "@/lib/campaignGoals";
import {
  hasNativeClientFeedback,
  sumPotentialRevenue,
  sumVacancies,
  type CatchupFeedbackRow,
  type OpeningBalanceRow,
} from "@/lib/clientFeedback";
import { fetchOffboardedUserIds } from "@/hooks/useOffboardedUsers";
import { fetchActiveAeUserIds } from "@/lib/aeRoster";

export interface CEOSnapshotWindow {
  start: Date;
  end: Date;
}

/**
 * CEO dashboard live-data floor — imported from the single permanent
 * constant (CLAUDE.md: 2026-06-01, never move). Earlier windows render
 * empty; straddling windows are clamped to this start.
 */
import { CEO_BACKFILL_CUTOVER, CEO_BACKFILL_CUTOVER_ISO } from "@/lib/ceo";
const CEO_LIVE_DATA_START = CEO_BACKFILL_CUTOVER;
const CEO_LIVE_DATA_START_ISO = CEO_BACKFILL_CUTOVER_ISO;


export interface TeamQaScore {
  setter_id: string;
  setter_name: string | null;
  avg_score: number;
  session_count: number;
  avg_rating: string | null;
}

/**
 * Aggregated CEO snapshot for an arbitrary date window.
 * Window is passed explicitly so the dashboard can toggle between
 * commission cycle (26th → 25th) and calendar month.
 */
export function useCEOSnapshot(window: CEOSnapshotWindow, userFilter: string[] = []) {
  const selectedStartISO = format(window.start, "yyyy-MM-dd");
  const endISO = format(window.end, "yyyy-MM-dd");
  const beforeLiveData = window.end.getTime() < CEO_LIVE_DATA_START.getTime();
  const startISO = beforeLiveData || selectedStartISO >= CEO_LIVE_DATA_START_ISO
    ? selectedStartISO
    : CEO_LIVE_DATA_START_ISO;
  const startTS = `${startISO}T00:00:00`;
  const endTS = `${endISO}T23:59:59`;
  const mode: "empty" | "live" = beforeLiveData ? "empty" : "live";
  const liveStartISO = startISO;
  const liveEndISO = endISO;
  const liveStartTS = `${liveStartISO}T00:00:00`;
  const liveEndTS = `${liveEndISO}T23:59:59`;
  const normFilter = (userFilter ?? [])
    .map((n) => (n || "").toLowerCase().trim())
    .filter(Boolean);
  const hasFilter = normFilter.length > 0;
  const filterKey = hasFilter ? normFilter.slice().sort().join("|") : "";

  return useQuery({
    queryKey: ["ceo-snapshot", selectedStartISO, endISO, mode, filterKey],
    queryFn: async () => {
      const useBackfill = false;
      const useLive = mode === "live";

      const emptySnapshot = () => ({
        windowLabel: `${format(window.start, "d MMM")} – ${format(window.end, "d MMM yyyy")}`,
        cashSource: "actual" as const,
        qaSessionsThisCycle: 0,
        teamQaScores: [] as TeamQaScore[],
        activeTotalSetters: 0,
        sdrManagerQaSessions: 0,
        sdrManagerAvgQaScore: null as number | null,
        overall: {
          cashCollected: 0,
          cashSource: "actual" as const,
          cashBasis: "actual" as const,
          activeClients: 0,
          discosBookedAll: 0,
          discosSat: 0,
          cac: null as number | null,
          satFulfilmentMeetings: 0,
          clientChurnCount: 0,
          clientChurnPct: null as number | null,
          vacanciesGenerated: 0,
          potentialRevenue: 0,
        },
        sales: {
          dealsClosed: 0,
          pifs: 0,
          pifPaymentCount: 0,
          retainers: 0,
          contractValueClosed: 0,
          cashCollected: 0,
          cashBasis: "actual" as const,
          newCashCollected: 0,
          newCashCollectedExVat: 0,
          pipelineReengagementBooked: null as number | null,
          daysSinceLastClose: null as number | null,
          discoToClosePct: null as number | null,
          totalCashBanked: 0,
          newCashSource: "actual" as const,
          discoSat: 0,
          followUpSat: 0,
          discoToFollowPct: null as number | null,
          followUpShowUpPct: null as number | null,
          closingPct: null as number | null,
          closingPending: false,
          totalFollowUps: 0,
          totalDiscoveries: 0,
          activeAEs: 0,
          activeAcquisitionSetters: 0,
        },
        acquisition: {
          meetingsBooked: 0,
          meetingsBookedByMeetingDate: 0,
          discosSat: 0,
          showUpRatePct: null as number | null,
          dials: 0,
          dialsToBookingRatio: null as number | null,
          talkTimeSeconds: 0,
          talkPerBookingSeconds: null as number | null,
          connects3Plus: null as number | null,
          connectToConversationPct: null as number | null,
          warmLeads: null as number | null,
          avgQaScore: null as number | null,
          rebooks: 0,
          activeSetters: 0,
          watchedTestimonialPct: null as number | null,
          avgDaysBookedToSat: null as number | null,
        },
        fulfilment: {
          teamMeetingsSat: 0,
          showUpRatePct: null as number | null,
          teamDials: 0,
          dialsToBookingRatio: null as number | null,
          teamTalkSeconds: 0,
          talkPerBookingSeconds: null as number | null,
          connects3Plus: null as number | null,
          connectToConversationPct: null as number | null,
          warmLeads: null as number | null,
          avgQaScore: null as number | null,
          avgAppointmentQaScore: null as number | null,
          avgMoodScore: null as number | null,
          pctSettersHappy: null as number | null,
          vacanciesGenerated: 0,
          potentialRevenue: 0,
          avgDaysBookedToSat: null as number | null,
          hasCloseData: false,
          pendingConfirmation: 0,
          activeFulfilmentSetters: 0,
          activeFulfilmentSettersExclMgr: 0,
          teamAvgMeetingsPerSetter: 0,
          appointmentsSet: 0,
          appointmentsBooked: 0,
          appointmentsBookedByMeetingDate: 0,
          satMeetingsCount: 0,
          teamSatRatePct: null as number | null,
          avgClientHealth: null as number | null,
          activeClients: 0,
          rampedPct: null as number | null,
          rampedCount: 0,
          rampClassifiedCount: 0,
          pctSettersHittingTarget: null as number | null,
          settersHittingTarget: 0,
          settersTargetEligible: 0,
          lowestHealthClients: [] as any[],
          sdrManager: {
            dials: 0,
            talkTimeMinutes: 0,
            meetingsBooked: 0,
            coachingSessions: 0,
            benchmarkPct: null as number | null,
          },
        },
        csm: {
          activeClients: 0,
          clientChurnCount: 0,
          clientChurnPct: null as number | null,
          avgClientHealth: null as number | null,
          catchupsThisCycle: 0,
          clientsOverdueCatchup: 0,
          vacanciesGenerated: 0,
          potentialRevenue: 0,
          avgMeetingQuality: null as number | null,
          newClientsOnboarded: null as number | null,
          avgDaysToFirstMeeting: null as number | null,
          pctClientsHittingWeeklyTarget: null as number | null,
          pctClientsOnStreak3w: null as number | null,
          pctClientsHappyMetric: null as number | null,
          pctClientsHappyCSM: null as number | null,
          csmHappyAssessedCount: null as number | null,
          videoTestimonials: null as number | null,
          writtenTestimonials: null as number | null,
          upsoldClients: null as number | null,
          leadListsTotal: null as number | null,
          leadListsFulfilment: null as number | null,
          leadListsAcquisition: null as number | null,
          leadListsUtilizationPct: null as number | null,
        },
        hiring: {
          trialCallsThisMonth: 0,
          trialCallsThisWindow: 0,
          passed: 0,
          failed: 0,
          pending: 0,
          hired: 0,
          passRatePct: null as number | null,
          newHires: 0,
          activeTotalSetters: 0,
          acquisitionActive: 0,
          fulfilmentActive: 0,
          passedProbation: 0,
          inProbation: 0,
          sdrChurnInWindow: 0,
          sdrChurnRatePct: null as number | null,
          sdrTeamAtWindowStart: 0,
          lctToHirePct: null as number | null,
          lctSatCount: 0,
          lctShowUpPct: null as number | null,
          lctAttendanceRecordedCount: 0,
          recruiterDials: null as number | null,
          recruiterTalkSeconds: null as number | null,
          finalInterviewsBooked: null as number | null,
          interviewToOfferPct: null as number | null,
          offerAcceptancePct: null as number | null,
        },
        finance: {
          cashPaidWindow: 0,
          invoicesPaidCount: 0,
          newClientPayments: 0,
          pifPaymentCount: 0,
          outstanding: 0,
          openInvoiceCount: 0,
          overdueCount: 0,
          overdueAmount: 0,
          cac: null as number | null,
          costToFulfil: null as number | null,
          avgLtv: 0,
          ltvCacRatio: null as number | null,
          marginPerClient: null as number | null,
          avgRevenuePerClient: 0,
          avgRevenuePerTeamMember: null as number | null,
          fulfilmentBookedCount: 0,
          fulfilmentSatCount: 0,
          costPerBookedMeeting: null as number | null,
          costPerSatMeeting: null as number | null,
          grossMarginPct: null as number | null,
          netMarginPct: null as number | null,
          nrrPct: null as number | null,
          revenueGrowthPct: null as number | null,
          freeCashFlow: null as number | null,
          cashOnHand: null as number | null,
          avgProfitPerTeamMember: null as number | null,
        },
        growth: {
          activeClients: 0,
          newClientsThisMonth: 0,
          avgLtv: 0,
          cac: null as number | null,
          costToFulfil: null as number | null,
          ltvCacRatio: null as number | null,
          marketingSpend: null as number | null,
          currency: "GBP",
          rawInput: null as any,
        },
      });

      if (mode === "empty") return emptySnapshot();

      const fromLive = (lvFn: () => any) => {
        return Promise.resolve(lvFn()).then((r: any) => ({
          data: ((r?.data ?? []) as any[]).map((row) => ({ ...row, _src: "live" })),
        }));
      };

      // Former employees are excluded from every live headcount/pick below
      // (their historical rows stay in the snapshot data untouched).
      const offboardedUserIds = await fetchOffboardedUserIds();

      // Pre-fetch SDR manager profile id (to filter call_scores).
      // Take the first manager who is still with the company — a plain
      // limit(1) could land on an offboarded manager.
      const sdrMgrRoleRes = await supabase
        .from("user_roles")

        .select("user_id")
        .eq("role", "sdr_manager" as any);
      const sdrMgrUserId =
        ((sdrMgrRoleRes.data ?? []) as any[])
          .map((r) => r?.user_id)
          .find((id) => id && !offboardedUserIds.has(id)) ?? null;

      let sdrMgrSetterId: string | null = null;
      if (sdrMgrUserId) {
        const sdrMgrSetterRes = await supabase
          .from("setters_profiles")
          .select("id")
          .eq("user_id", sdrMgrUserId)
          .maybeSingle();
        sdrMgrSetterId = (sdrMgrSetterRes.data as any)?.id ?? null;
      }

      // All user_ids that actually hold the 'setter' role — used to filter
      // setters_profiles down to genuine setters (the department column is
      // also used by CSMs/Devs/SDR managers/AEs/HR who share a profile row).
      const setterRolesRes = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "setter" as any);
      const setterUserIds = new Set(
        (setterRolesRes.data ?? []).map((r: any) => r.user_id),
      );

      const [
        pitchConvertedRes,
        discoConvertedRes,
        pitchWindowRes,
        discoWindowRes,
        growthInputRes,
        candidatesRes,
        clientProfilesRes,
        manualMetricsRes,
        settersRes,
        rebooksRes,
        fulfilmentMeetingsRes,
        acquisitionMeetingsRes,
        paymentsRes,
        callScoresRes,
        sdrMgrCallScoresRes,
        sdrMgrCoachingRes,
        catchupsAllRes,
        catchupsWindowRes,
        invoicesRes,
        closeMetricsRes,
        clientsRes,
        meetingScoresRes,
        backfillTelemetryRes,
        healthSnapshotRes,
        lastCloseRes,
        acqBookedByCreatedRes,
        fulBookedByCreatedRes,
        setterFeedbackRes,
        onboardingCompletedRes,
        clientMeetingsRes,
        weeklyGoalsRes,
        feedbackCatchupsRes,
        openingBalancesRes,
        testimonialsRes,
        pipelineReengagementRes,
        clientRenewalsRes,
        hiringPipelineRes,
        leadListsRes,
        listAssignmentsRes,
        csmHappinessRes,
        setterTargetsRes,
        trailing7dMeetingsRes,
        lctAttendanceRes,
      ] = await Promise.all([

        supabase
          .from("pitch_calls")
          .select(
            "id, discovery_log_id, contract_value, contract_term, updated_at, converted_to_client, cash_collected_ex_vat, is_pif",
          )
          .eq("converted_to_client", true)
          .gte("updated_at", startTS)
          .lte("updated_at", endTS),
        supabase
          .from("sales_discovery_logs")
          .select("id, contract_value, contract_term, updated_at, converted_to_client, cash_collected_ex_vat")
          .eq("converted_to_client", true)
          .gte("updated_at", startTS)
          .lte("updated_at", endTS),
        fromLive(
          () =>
            supabase
              .from("pitch_calls")
              .select("id, status, pitch_outcome, pitch_call_date, company_name, client_email")
              .gte("pitch_call_date", liveStartISO)
              .lte("pitch_call_date", liveEndISO),
        ),
        fromLive(
          () =>
            supabase
              .from("sales_discovery_logs")
              .select("id, attendance_confirmed, outcome, meeting_at, client_email, client_name, is_pipeline_reengagement")
              .gte("meeting_at", liveStartTS)
              .lte("meeting_at", liveEndTS),
        ),

        supabase
          .from("ceo_growth_inputs")
          .select("*")
          .eq("month", format(window.start, "yyyy-MM-01"))
          .maybeSingle(),
        supabase
          .from("candidates")
          .select("id, status, date_of_call")
          .gte("date_of_call", startISO)
          .lte("date_of_call", endISO),
        supabase
          .from("client_profiles")
          .select("id, user_id, company_name, status, contract_value, created_at, updated_at, health_score, campaign_start_date"),
        supabase
          .from("manual_daily_metrics")
          .select(
            "dials, talk_time_minutes, meetings_booked_input, warm_leads, department, target_role, target_user_id, date",
          )
          .gte("date", startISO)
          .lte("date", endISO),
        supabase
          .from("setters_profiles")
          .select("id, user_id, full_name, department, is_test_account, active, start_date, created_at, updated_at, close_user_id, ramp_stage"),
        supabase
          .from("meetings")
          .select("id, setter_profile_id, meeting_date, is_rebook, department")
          .eq("is_rebook", true)
          .gte("meeting_date", startISO)
          .lte("meeting_date", endISO),
        fromLive(
          () =>
            supabase
              .from("meetings")
              .select(
                "id, setter_profile_id, meeting_date, attendance_status, attendance_confirmed, department, is_rebook, vacancies_won, vacancies_value, created_at",
              )
              .eq("department", "fulfilment")
              .eq("is_rebook", false)
              .gte("meeting_date", liveStartISO)
              .lte("meeting_date", liveEndISO),
        ),

        supabase
          .from("meetings")
          .select(
            "id, setter_profile_id, meeting_date, attendance_status, attendance_confirmed, department, is_rebook, created_at, prospect_watched_video",
          )
          .or("department.eq.acquisition,department.eq.Acquisition")
          .eq("is_rebook", false)
          .gte("meeting_date", startISO)
          .lte("meeting_date", endISO),
        supabase
          .from("client_payments")
          .select("id, amount, payment_date, client_id")
          .gte("payment_date", startISO)
          .lte("payment_date", endISO),
        supabase
          .from("call_scores")
          .select("setter_id, setter_name, weighted_total, performance_rating, call_date, department")
          .gte("call_date", startISO)
          .lte("call_date", endISO),
        sdrMgrSetterId
          ? supabase
              .from("call_scores")
              .select("weighted_total, call_date")
              .eq("setter_id", sdrMgrSetterId)
              .gte("call_date", startISO)
              .lte("call_date", endISO)
          : Promise.resolve({ data: [] as any[] } as any),
        sdrMgrUserId
          ? supabase
              .from("coaching_sessions")
              .select("id, session_date, created_at, status")
              .eq("manager_user_id", sdrMgrUserId)
              .eq("status", "completed")
              .gte("session_date", startISO)
              .lte("session_date", endISO < format(new Date(), "yyyy-MM-dd") ? endISO : format(new Date(), "yyyy-MM-dd"))
          : Promise.resolve({ data: [] as any[] } as any),
        supabase
          .from("client_catchups")
          .select("id, client_profile_id, scheduled_date"),
        supabase
          .from("client_catchups")
          .select("id, client_profile_id, scheduled_date")
          .gte("scheduled_date", startISO)
          .lte("scheduled_date", endISO),
        supabase
          .from("invoices")
          .select("id, amount, status, paid_at, due_date, created_at"),
        supabase
          .from("setter_close_metrics")
          .select("close_user_id, department, date, dials, talk_time_seconds, connects, connects_3_plus_mins")
          .gte("date", startISO)
          .lte("date", endISO),
        supabase
          .from("clients")
          .select("id, auth_user_id"),
        supabase
          .from("meeting_scores")
          .select("appointment_id, setter_name, overall_quality, fit, engagement, authority, next_step, meeting_date")
          .gte("meeting_date", startISO)
          .lte("meeting_date", endISO),
        Promise.resolve({ data: [] as any[] } as any),
        // Sheet fetch retired (ruling 2026-07-16): the CEO snapshot no
        // longer reads fetch-client-health-snapshot. The stub keeps the
        // positional destructure aligned; the edge function survives only
        // for the parity page + opening-balances seed tool.
        Promise.resolve({ data: [] as any[] } as any),
        supabase
          .from("pitch_calls")
          .select("closed_on, updated_at")
          .eq("converted_to_client", true)
          .order("closed_on", { ascending: false, nullsFirst: false })
          .limit(1),
        // Discos booked by CREATED_AT (activity on the day of booking).
        // Kept separate from `acquisitionMeetingsRes` which filters on
        // `meeting_date` and powers show-up / sat outcomes.
        supabase
          .from("meetings")
          .select("id, setter_profile_id, created_at")
          .or("department.eq.acquisition,department.eq.Acquisition")
          .eq("is_rebook", false)
          .gte("created_at", startTS)
          .lte("created_at", endTS),
        supabase
          .from("meetings")
          .select("id, setter_profile_id, created_at")
          .eq("department", "fulfilment")
          .eq("is_rebook", false)
          .gte("created_at", startTS)
          .lte("created_at", endTS),
        supabase
          .from("setter_feedback")
          .select("setter_id, mood, date")
          .gte("date", startISO)
          .lte("date", endISO),
        supabase
          .from("client_onboarding_stages")
          .select("client_profile_id, completed_at")
          .gte("completed_at", startTS)
          .lte("completed_at", endTS),
        supabase
          .from("meetings")
          .select("client_profile_id, created_at")
          .not("client_profile_id", "is", null),
        supabase
          .from("campaign_weekly_goals")
          .select(
            "id, client_id, campaign_id, week_number, week_start, week_end, target, achieved, goal_met",
          ),
        // Native CSM capture (Batch 2). Kept separate from the catchups
        // queries above so a missing migration only disables the native
        // vacancy/revenue path (sheet fallback) without touching them.
        supabase
          .from("client_catchups")
          .select(
            "client_profile_id, status, scheduled_date, completed_at, vacancies_open, potential_revenue_total, opportunities",
          )
          .eq("status", "completed"),
        supabase
          .from("client_health_opening_balances")
          .select("client_profile_id, vacancies, potential_revenue, opportunities"),
        supabase
          .from("testimonials")
          .select("id, type, obtained_at")
          .gte("obtained_at", startISO)
          .lte("obtained_at", endISO),
        // Pipeline re-engagement bookings (Batch 4). Isolated query: before
        // the meetings.is_pipeline_reengagement migration runs it fails
        // alone and the tile renders "—" instead of a fake 0.
        supabase
          .from("meetings")
          .select("id, created_at")
          .or("department.eq.acquisition,department.eq.Acquisition")
          .eq("is_pipeline_reengagement", true)
          .gte("created_at", startTS)
          .lte("created_at", endTS),
        // Client renewals/upsells (Batch 5). Isolated + error-aware: the
        // tile renders "—" until the client_renewals migration runs.
        supabase
          .from("client_renewals")
          .select("client_profile_id, kind, effective_date")
          .gte("effective_date", startISO)
          .lte("effective_date", endISO),
        // Hiring pipeline stage dates (N15-N17). Isolated + error-aware:
        // the tiles render "—" until the hiring pipeline migration runs.
        // Unfiltered fetch — each metric windows on a different date column,
        // so windows are applied client-side.
        supabase
          .from("candidates")
          .select("id, sdr_interview_date, offer_letter_date, accepted_date"),
        // Lead lists (Client Health tile). Isolated + error-aware: renders
        // "—" until the lead-list tracking migration adds list_type.
        supabase
          .from("client_lead_lists")
          .select("id, client_profile_id, status, list_type, total_contacts, is_default"),
        // Active assignments with their lead-list linkage, for the
        // dial-based utilization aggregate. Same error-aware pattern.
        supabase
          .from("setter_client_assignments")
          .select("setter_id, client_id, lead_list_id")
          .eq("status", "active"),
        // CSM happiness scores (N11, dual-score model). Isolated from the
        // main client_profiles query so the tile degrades to metric-only
        // until the dual-happiness migration is applied.
        supabase
          .from("client_profiles")
          .select("id, csm_happy" as "id"),
        // Per-setter targets (N19). Isolated: pre-migration the "% setters
        // hitting target" row degrades to "—", nothing else breaks.
        (supabase as any)
          .from("setter_targets")
          .select("setter_profile_id, weekly_meetings_target"),
        // Trailing 7 days of fulfilment bookings for the target rollup —
        // deliberately now-relative, not window-relative: targets are
        // weekly, so the rollup always answers "who is hitting target
        // right now", regardless of the month being viewed.
        supabase
          .from("meetings")
          .select("id, setter_profile_id, is_rebook, department, created_at")
          .eq("department", "fulfilment")
          .eq("is_rebook", false)
          .gte("created_at", `${format(subDays(new Date(), 7), "yyyy-MM-dd")}T00:00:00`),
        // LCT attendance (W17). Isolated: pre-migration the show-up rate
        // keeps the legacy verdict-proxy for every candidate.
        supabase
          .from("candidates")
          .select("id, lct_attendance" as "id")
          .gte("date_of_call", startISO)
          .lte("date_of_call", endISO),
      ]);


      const pitchConverted = (pitchConvertedRes.data ?? []) as any[];
      const discoConverted = (discoConvertedRes.data ?? []) as any[];
      const pitchWindow = pitchWindowRes.data ?? [];
      const discoWindow = discoWindowRes.data ?? [];
      const candidates = candidatesRes.data ?? [];
      const clientProfiles = (clientProfilesRes.data ?? []) as any[];
      
      const setters = (settersRes.data ?? []) as any[];

      // ── USER FILTER (applied BEFORE aggregation) ────────────────────────
      // Match selected names against either full names ("Ethan Cole") or
      // single tokens / first names ("Mia", "Luis"). Case-insensitive.
      const norm = (s: any) => String(s ?? "").toLowerCase().trim();
      const matchesFilterName = (name?: string | null): boolean => {
        if (!hasFilter) return true;
        const n = norm(name);
        if (!n) return false;
        if (normFilter.includes(n)) return true;
        // Fuzzy: any filter token appears as a whole word in the candidate name
        const tokens = n.split(/\s+/);
        return normFilter.some(
          (f) => tokens.includes(f) || n.includes(f),
        );
      };
      const selectedSetters = hasFilter
        ? setters.filter((s: any) => matchesFilterName(s.full_name))
        : setters;
      const selectedProfileIds = new Set(selectedSetters.map((s: any) => String(s.id)));
      const selectedUserIds = new Set(
        selectedSetters.map((s: any) => String(s.user_id ?? "")).filter(Boolean),
      );
      const selectedCloseUserIds = new Set(
        selectedSetters
          .map((s: any) => String(s.close_user_id ?? ""))
          .filter(Boolean),
      );

      let manualMetrics = (manualMetricsRes.data ?? []) as any[];
      let rebooks = (rebooksRes.data ?? []) as any[];
      let fulfilmentMeetings = (fulfilmentMeetingsRes.data ?? []) as any[];
      let acquisitionMeetings = (acquisitionMeetingsRes.data ?? []) as any[];
      let payments = (paymentsRes.data ?? []) as any[];
      let callScores = (callScoresRes.data ?? []) as any[];
      const sdrMgrCallScores = (sdrMgrCallScoresRes.data ?? []) as any[];
      const sdrMgrCoachingRows = (sdrMgrCoachingRes.data ?? []) as any[];
      let catchupsAll = (catchupsAllRes.data ?? []) as any[];
      let catchupsWindow = (catchupsWindowRes.data ?? []) as any[];
      const invoices = (invoicesRes.data ?? []) as any[];
      let closeMetrics = (closeMetricsRes.data ?? []) as any[];
      // Unfiltered reference kept for HR/recruiter telemetry, which must not
      // be affected by the per-setter name filter below.
      const closeMetricsAll = closeMetrics;
      let clientsRows = (clientsRes.data ?? []) as any[];
      // Test-client exclusion (2026-08-26, onboarding demo button): isolated
      // query so pre-migration (no is_test_account column) it errors quietly
      // and nothing is filtered — same degrade pattern as csm_happy above.
      {
        const { data: testClients } = await (supabase as any)
          .from("client_profiles")
          .select("id")
          .eq("is_test_account", true);
        const testIds = new Set(((testClients ?? []) as any[]).map((r) => r.id));
        if (testIds.size > 0) {
          clientsRows = clientsRows.filter((c) => !testIds.has(c.id));
          // 2 Sep audit fix: the roster exclusion alone left MONEY-shaped
          // tiles leaky — a test client's payments and catch-ups still moved
          // CEO cash-collected, retainer and catch-up numbers. Same set,
          // same degrade pattern. (invoices carries no client column and the
          // table has never held a row — nothing to filter there.)
          payments = payments.filter((r) => !r.client_id || !testIds.has(r.client_id));
          catchupsAll = catchupsAll.filter((r) => !r.client_profile_id || !testIds.has(r.client_profile_id));
          catchupsWindow = catchupsWindow.filter((r) => !r.client_profile_id || !testIds.has(r.client_profile_id));
        }
      }
      let meetingScores = (meetingScoresRes.data ?? []) as any[];
      let backfillTelemetry = ((backfillTelemetryRes as any)?.data ?? []) as any[];

      // Test-account exclusion (2026-07-21): call_scores and meeting_scores
      // are fetched by department + window only, so test setters' QA rows
      // must be dropped here — matching the setters_profiles population-gate
      // convention (filterToSetterRoleIds / setters_profiles_safe) used by
      // every other aggregate. call_scores.setter_id is text and holds a
      // close_user_id or auth uuid depending on the n8n workflow version, so
      // match every known identifier plus setter_name.
      const testSetters = setters.filter((s) => s.is_test_account === true);
      const testSetterIdentifiers = new Set(
        testSetters.flatMap((s) =>
          [s.id, s.user_id, s.close_user_id].filter(Boolean).map(String),
        ),
      );
      const testSetterNames = new Set(
        testSetters.map((s) => norm(s.full_name ?? "")).filter(Boolean),
      );
      const testSetterProfileIds = new Set(testSetters.map((s) => String(s.id)));
      const testMeetingIds = new Set(
        [...fulfilmentMeetings, ...acquisitionMeetings]
          .filter((m) => testSetterProfileIds.has(String(m.setter_profile_id ?? "")))
          .map((m) => String(m.id)),
      );
      callScores = callScores.filter(
        (r) =>
          !testSetterIdentifiers.has(String(r.setter_id ?? "")) &&
          !testSetterNames.has(norm(r.setter_name ?? "")),
      );
      meetingScores = meetingScores.filter(
        (s) =>
          !testMeetingIds.has(String(s.appointment_id ?? "")) &&
          !testSetterNames.has(norm(s.setter_name ?? "")),
      );
      // Test-account exclusion, extended (2026-08-13): the meeting arrays
      // themselves were still table-wide, so a demo setter's seeded meetings
      // inflated appointmentsBooked / teamMeetingsSat / sat-rate / vacancies
      // / potentialRevenue / pending / days-to-sat. Drop them at source —
      // every downstream aggregate then agrees with the roster-gated tiles.
      const isTestMeetingRow = (m: {
        setter_profile_id?: unknown;
        setter_id?: unknown;
        logged_by_setter_id?: unknown;
      }) =>
        testSetterIdentifiers.has(String(m.setter_profile_id ?? "")) ||
        testSetterIdentifiers.has(String(m.setter_id ?? "")) ||
        testSetterIdentifiers.has(String(m.logged_by_setter_id ?? ""));
      fulfilmentMeetings = fulfilmentMeetings.filter((m) => !isTestMeetingRow(m));
      acquisitionMeetings = acquisitionMeetings.filter((m) => !isTestMeetingRow(m));
      rebooks = rebooks.filter((r) => !isTestMeetingRow(r));

      if (hasFilter) {
        manualMetrics = manualMetrics.filter((m: any) =>
          selectedUserIds.has(String(m.target_user_id ?? "")),
        );
        rebooks = rebooks.filter((r: any) =>
          selectedProfileIds.has(String(r.setter_profile_id ?? "")),
        );
        // Live fulfilment meetings carry setter_profile_id; backfill rows carry setter_name.
        fulfilmentMeetings = fulfilmentMeetings.filter((m: any) =>
          m.setter_profile_id
            ? selectedProfileIds.has(String(m.setter_profile_id))
            : matchesFilterName(m.setter_name),
        );
        acquisitionMeetings = acquisitionMeetings.filter((m: any) =>
          selectedProfileIds.has(String(m.setter_profile_id ?? "")),
        );
        closeMetrics = closeMetrics.filter(
          (r: any) =>
            selectedCloseUserIds.has(String(r.close_user_id ?? "")) ||
            matchesFilterName(r.setter_name),
        );
        backfillTelemetry = backfillTelemetry.filter((r: any) =>
          matchesFilterName(r.setter_name),
        );
        callScores = callScores.filter(
          (r: any) =>
            selectedProfileIds.has(String(r.setter_id ?? "")) ||
            matchesFilterName(r.setter_name),
        );
      }

      // Discos booked filtered by CREATED_AT (activity-day view).
      // Apply user filter by setter_profile_id when active.
      let acqBookedByCreatedRows = ((acqBookedByCreatedRes as any)?.data ?? []) as any[];
      let fulBookedByCreatedRows = ((fulBookedByCreatedRes as any)?.data ?? []) as any[];
      if (hasFilter) {
        acqBookedByCreatedRows = acqBookedByCreatedRows.filter((m: any) =>
          selectedProfileIds.has(String(m.setter_profile_id ?? "")),
        );
        fulBookedByCreatedRows = fulBookedByCreatedRows.filter((m: any) =>
          selectedProfileIds.has(String(m.setter_profile_id ?? "")),
        );
      }
      const acqBookedByCreatedCount = acqBookedByCreatedRows.length;
      const fulBookedByCreatedCount = fulBookedByCreatedRows.length;
      const bfAcqDials = backfillTelemetry
        .filter((r: any) => r.department === "acquisition")
        .reduce((s, r: any) => s + Number(r.dials || 0), 0);
      const bfAcqTalkSeconds = backfillTelemetry
        .filter((r: any) => r.department === "acquisition")
        .reduce((s, r: any) => s + Number(r.talk_time_seconds || 0), 0);
      const bfAcqWarmLeads = backfillTelemetry
        .filter((r: any) => r.department === "acquisition")
        .reduce((s, r: any) => s + Number(r.warm_leads || 0), 0);
      const bfFulDials = backfillTelemetry
        .filter((r: any) => r.department === "fulfilment")
        .reduce((s, r: any) => s + Number(r.dials || 0), 0);
      const bfFulTalkSeconds = backfillTelemetry
        .filter((r: any) => r.department === "fulfilment")
        .reduce((s, r: any) => s + Number(r.talk_time_seconds || 0), 0);
      const bfFulWarmLeads = backfillTelemetry
        .filter((r: any) => r.department === "fulfilment")
        .reduce((s, r: any) => s + Number(r.warm_leads || 0), 0);
      const fulfilmentPendingCount = fulfilmentMeetings.filter(
        (m: any) => m.attendance_status === 'pending' ||
                    (!m.attendance_confirmed && !m.attendance_status)
      ).length;


      const inWindow = (iso?: string | null) => {
        if (!iso) return false;
        const t = Date.parse(iso);
        return t >= window.start.getTime() && t <= window.end.getTime();
      };

      // ── SALES · AE ────────────────────────────────────────────────────────
      const pitchClosesInWindow = pitchConverted.map((p) => ({
        id: p.id,
        discovery_log_id: p.discovery_log_id ?? null,
        contract_value: p.contract_value,
        updated_at: p.updated_at,
      }));
      const discoClosesInWindow = discoConverted.map((d) => ({
        id: d.id,
        contract_value: d.contract_value,
        updated_at: d.updated_at,
      }));

      const uniqueDeals = getUniqueConvertedDeals(
        pitchClosesInWindow,
        discoClosesInWindow,
      );

      const termLooksPif = (term: unknown) => {
        const t = (term ?? "").toString().toLowerCase();
        return t.includes("pif") || t.includes("upfront") || t.includes("paid in full");
      };
      // is_pif (set by MarkAsWonModal on every close) wins when present; the
      // contract_term text match only covers rows without it (pre-boolean pitch
      // closes, discovery-only closes — sales_discovery_logs has no is_pif).
      const isPifDeal = (deal: { source: string; key: string }): boolean => {
        if (deal.source === "pitch_call") {
          const id = deal.key.startsWith("pitch:")
            ? deal.key.slice("pitch:".length)
            : null;
          const match =
            (id && pitchConverted.find((p) => p.id === id)) ||
            pitchConverted.find((p) => p.discovery_log_id === deal.key);
          if (match?.is_pif != null) return match.is_pif === true;
          return termLooksPif(match?.contract_term);
        }
        const id = deal.key.slice("discovery:".length);
        const match = discoConverted.find((d) => d.id === id);
        return termLooksPif(match?.contract_term);
      };
      const pifs = uniqueDeals.filter(isPifDeal).length;
      const dealsClosed = uniqueDeals.length;
      const retainers = Math.max(0, dealsClosed - pifs);

      // Cash collected — prefer client_payments
      const paymentsSum = payments.reduce(
        (s, p: any) => s + Number(p.amount || 0),
        0,
      );
      let newCashCollected = paymentsSum;
      let cashSource: "actual" | "estimated" = "actual";
      if (payments.length === 0) {
        newCashCollected = sumConvertedDealValue(uniqueDeals);
        cashSource = "estimated";
      }
      const cashCollected = newCashCollected;

      // Disco sat — outcome='sat' OR attendance_confirmed. Rebooks INCLUDED.
      const isDiscoSat = (d: any) =>
        d.attendance_confirmed === true || d.outcome === "sat";
      const discoSat = discoWindow.filter(isDiscoSat).length;

      // Pitch sat — pitch_outcome='sat' OR status sat/completed. Rebooks INCLUDED.
      const isSat = (row: { status?: string | null; pitch_outcome?: string | null }) =>
        row.pitch_outcome === "sat" ||
        row.status === "sat" ||
        row.status === "completed";
      const followUpSat = pitchWindow.filter(isSat).length;

      // Linked disco→pitch %: companies whose disco sat AND who reached a pitch.
      // Match on lower(company_name) when present, else lower(client_email).
      const companyKey = (r: any): string | null => {
        const c = String(r?.company_name ?? "").toLowerCase().trim();
        if (c) return c;
        const e = String(r?.client_email ?? "").toLowerCase().trim();
        return e || null;
      };
      const satDiscoCompanies = new Set(
        discoWindow.filter(isDiscoSat).map(companyKey).filter(Boolean) as string[],
      );
      const pitchCompanies = new Set(
        (pitchWindow as any[]).map(companyKey).filter(Boolean) as string[],
      );
      const linkedDiscoToPitch = Array.from(satDiscoCompanies).filter((c) =>
        pitchCompanies.has(c),
      ).length;
      let discoToFollowPct: number | null =
        satDiscoCompanies.size > 0
          ? Math.min(100, (linkedDiscoToPitch / satDiscoCompanies.size) * 100)
          : null;

      const followUpShowUpPct: number | null =
        pitchWindow.length > 0
          ? Math.min(100, (followUpSat / pitchWindow.length) * 100)
          : null;

      const mergedDealsClosed = dealsClosed;
      const mergedPifs = pifs;
      const mergedRetainers = retainers;
      const mergedContractValueClosed = sumConvertedDealValue(uniqueDeals);
      const mergedCashCollected = cashCollected;
      const cashBasis: "modeled" | "mixed" | "actual" = "actual";

      // Closing % = deals / sat pitches. Cap at 100; if undefined or exceeds,
      // null signals "outcomes pending" to the UI (it shows raw counts instead).
      const rawClosingPct =
        followUpSat > 0 ? (mergedDealsClosed / followUpSat) * 100 : null;
      const closingPct: number | null =
        rawClosingPct == null || rawClosingPct > 100 ? null : rawClosingPct;
      const closingPending =
        mergedDealsClosed > 0 && (followUpSat === 0 || (rawClosingPct ?? 0) > 100);

      // ── NEW CEO SALES TILE METRICS ─────────────────────────────────────
      // Sum ex-VAT cash from AE closes in window (pitch + direct-close discos).
      const newCashCollectedExVat =
        pitchConverted.reduce((s, p: any) => s + Number(p.cash_collected_ex_vat || 0), 0) +
        discoConverted.reduce((s, d: any) => s + Number(d.cash_collected_ex_vat || 0), 0);

      // Pipeline re-engagement meetings booked in window (live only), from
      // the meetings flag written by the AE "Log discovery" modal. Counted
      // on created_at (booked-when-logged), matching the tile's "Booked"
      // label. Error-aware: null (→ "—") if the source query failed, e.g.
      // before the migration runs — never a fake 0.
      const pipelineReengagementBooked = pipelineReengagementRes?.error
        ? null
        : (pipelineReengagementRes?.data ?? []).length;

      // Days since last close (global, not window-scoped).
      const lastClose = ((lastCloseRes as any)?.data ?? [])[0];
      const lastCloseDateStr = lastClose?.closed_on ?? lastClose?.updated_at ?? null;
      const daysSinceLastClose = lastCloseDateStr
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(lastCloseDateStr).getTime()) / (1000 * 60 * 60 * 24),
            ),
          )
        : null;

      // Disco → close % in window.
      const discoToClosePct =
        discoSat > 0 ? Math.min(100, (mergedDealsClosed / discoSat) * 100) : null;



      // ── SALES · ACQUISITION SETTERS ───────────────────────────────────────
      const acquisitionRows = manualMetrics.filter(
        (m) => m.department === "acquisition",
      );
      const acqDials = acquisitionRows.reduce(
        (s, m) => s + Number(m.dials || 0),
        0,
      );
      const acqTalkTime = acquisitionRows.reduce(
        (s, m) => s + Number(m.talk_time_minutes || 0),
        0,
      );
      const acquisitionSetterIds = new Set(
        setters
          .filter(
            (s) =>
              s.department === "acquisition" &&
              !s.is_test_account &&
              s.active !== false &&
              setterUserIds.has(s.user_id),
          )
          .map((s) => s.id),
      );
      // Meetings booked from meetings table (live) + discoveries (backfill portion).
      const bfDiscoCount = discoWindow.filter((d: any) => d._src === "backfill").length;
      const liveAcqCount = acquisitionMeetings.length;
      const acqMeetings = useBackfill
        ? discoWindow.length
        : useLive
          ? liveAcqCount
          : bfDiscoCount + liveAcqCount;
      const liveAcqSatCount = acquisitionMeetings.filter((m: any) => isMeetingSat(m)).length;
      const bfDiscoSatCount = discoWindow.filter(
        (d: any) =>
          d._src === "backfill" &&
          (d.attendance_confirmed === true || d.outcome === "sat") &&
          d.is_rebook !== true,
      ).length;
      const overallDiscosBookedAll = useBackfill
        ? discoWindow.length
        : useLive
          ? liveAcqCount
          : bfDiscoCount + liveAcqCount;
      const overallDiscosSat = useBackfill
        ? discoSat
        : useLive
          ? liveAcqSatCount
          : bfDiscoSatCount + liveAcqSatCount;
      const acqRebooks = useBackfill
        ? 0
        : rebooks.filter((r: any) =>
            acquisitionSetterIds.has(r.setter_profile_id),
          ).length;
      const activeAcquisitionSetters = acquisitionSetterIds.size;

      // ── FULFILMENT ────────────────────────────────────────────────────────
      const fulfilmentManualRows = manualMetrics.filter(
        (m) => m.department === "fulfilment" && m.target_role !== "sdr_manager",
      );
      const teamMeetingsSat = fulfilmentMeetings.filter((m: any) => isMeetingSat(m)).length;
      const teamDials = fulfilmentManualRows.reduce(
        (s, m) => s + Number(m.dials || 0),
        0,
      );
      const teamTalkTime = fulfilmentManualRows.reduce(
        (s, m) => s + Number(m.talk_time_minutes || 0),
        0,
      );
      // Per-setter warm leads entered via CSM Fulfilment Metrics. Deliberately
      // excludes sdr_manager rows' team_warm_leads to avoid double-counting.
      const fulWarmRows = fulfilmentManualRows.filter((m) => m.warm_leads != null);
      const manualFulWarmLeads = fulWarmRows.reduce(
        (s, m) => s + Number(m.warm_leads || 0),
        0,
      );
      const fulfilmentActiveList = setters.filter(
        (s) =>
          s.department === "fulfilment" &&
          !s.is_test_account &&
          s.active !== false &&
          setterUserIds.has(s.user_id),
      );
      const activeFulfilmentSetters = fulfilmentActiveList.length;
      const activeFulfilmentSettersExclMgr = fulfilmentActiveList.filter(
        (s) => s.user_id !== sdrMgrUserId,
      ).length;
      const teamAvgMeetingsPerSetter =
        activeFulfilmentSettersExclMgr > 0
          ? teamMeetingsSat / activeFulfilmentSettersExclMgr
          : 0;
      // Ramp status — % ramped vs. ramping among classified fulfilment setters
      const fulRampClassified = fulfilmentActiveList.filter(
        (s: any) => s.ramp_stage === "ramping" || s.ramp_stage === "ramped",
      );
      const fulRamped = fulRampClassified.filter((s: any) => s.ramp_stage === "ramped").length;
      const fulRampedPct =
        fulRampClassified.length > 0 ? (fulRamped / fulRampClassified.length) * 100 : null;

      // ── SETTER HAPPINESS (EOD mood check-ins) ───────────────────────────
      // Mood → score mapping mirrors AdminFeedbackTab.
      const MOOD_SCORE: Record<string, number> = {
        very_happy: 10,
        happy: 8,
        neutral: 5,
        unhappy: 3,
        very_unhappy: 1,
      };
      const fulfilmentUserIds = new Set(
        fulfilmentActiveList.map((s) => String(s.user_id ?? "")).filter(Boolean),
      );
      const setterFeedbackRows = (setterFeedbackRes.data ?? []).filter(
        (r) =>
          fulfilmentUserIds.has(String(r.setter_id ?? "")) &&
          (!hasFilter || selectedUserIds.has(String(r.setter_id ?? ""))),
      );
      const moodScores = setterFeedbackRows
        .map((r) => MOOD_SCORE[String(r.mood ?? "")])
        .filter((n): n is number => n != null);
      const avgMoodScore =
        moodScores.length > 0
          ? moodScores.reduce((a, b) => a + b, 0) / moodScores.length
          : null;
      const happyCheckins = setterFeedbackRows.filter(
        (r) => r.mood === "happy" || r.mood === "very_happy",
      ).length;
      const pctSettersHappy =
        setterFeedbackRows.length > 0
          ? (happyCheckins / setterFeedbackRows.length) * 100
          : null;


      // Active AEs — shared roster (role-holders + acting AEs, minus
      // offboarded), so Marcus-as-acting-AE keeps the tile non-zero.
      const activeAEs = (await fetchActiveAeUserIds()).length;

      // SDR Manager personal metrics
      const sdrManagerRows = manualMetrics.filter(
        (m) => m.target_role === "sdr_manager",
      );
      const sdrManagerDials = sdrManagerRows.reduce(
        (s, m) => s + Number(m.dials || 0),
        0,
      );
      const sdrManagerTalkTime = sdrManagerRows.reduce(
        (s, m) => s + Number(m.talk_time_minutes || 0),
        0,
      );
      const sdrManagerMeetings = sdrManagerRows.reduce(
        (s, m) => s + Number(m.meetings_booked_input || 0),
        0,
      );
      const sdrManagerQaSessions = sdrMgrCallScores.length;
      const sdrManagerAvgQaScore =
        sdrMgrCallScores.length > 0
          ? sdrMgrCallScores.reduce(
              (s: number, r: any) => s + Number(r.weighted_total || 0),
              0,
            ) / sdrMgrCallScores.length
          : null;
      const sdrManagerCoachingSessions = sdrMgrCoachingRows.length;


      // Clients & health (active only)
      const clientActiveInWindow = (c: any) => {
        const cs = c.campaign_start_date ? Date.parse(c.campaign_start_date) : null;
        const ce = c.campaign_end_date ? Date.parse(c.campaign_end_date) : null;
        // start date is usually unknown in backfill — treat a missing start as "already started".
        // A client is active in the window if its campaign had not ended before the window began.
        const startedByWindowEnd = cs == null || cs <= window.end.getTime();
        const notYetEndedAtWindowStart = ce == null || ce >= window.start.getTime();
        return startedByWindowEnd && notYetEndedAtWindowStart;
      };
      // client_profiles is SSOT (ruling 2026-07-16): the live active roster
      // is every status='active' profile. The Google-Sheet intersection that
      // used to gate this list is retired — the sheet is no longer a source
      // of truth for any user-facing number.
      const liveActiveByStatus = clientProfiles.filter((c) => c.status === "active");
      const activeClientList = useBackfill
        ? clientProfiles.filter(clientActiveInWindow)
        : liveActiveByStatus;

      const activeClients = activeClientList.length;
      // New clients = created in window AND finalized at some point. A client
      // only starts counting once onboarding is completed (status leaves
      // 'pending'), attributed to their close month — so a past month's number
      // can tick up when a straddling client finalizes. Deliberately
      // status !== 'pending' rather than === 'active': this is a flow metric,
      // and since-churned (inactive) clients must keep counting in their
      // historical signup month.
      const newClientsInWindow = clientProfiles.filter(
        (c) => inWindow(c.created_at) && c.status !== "pending",
      ).length;
      const healthScores = activeClientList
        .filter((c) => c.health_score != null)
        .map((c) => Number(c.health_score));
      const avgClientHealth =
        healthScores.length > 0
          ? healthScores.reduce((s, n) => s + n, 0) / healthScores.length
          : null;

      const appointmentsBooked = fulfilmentMeetings.length;
      const appointmentsSet = appointmentsBooked;
      const teamSatRatePct =
        appointmentsBooked > 0 ? (teamMeetingsSat / appointmentsBooked) * 100 : null;


      // Lowest health active clients
      const lowestHealthClients = [...activeClientList]
        .sort((a, b) => {
          const av = a.health_score == null ? 101 : Number(a.health_score);
          const bv = b.health_score == null ? 101 : Number(b.health_score);
          return av - bv;
        })
        .slice(0, 10)
        .map((c) => ({
          id: c.id,
          company_name: c.company_name,
          health_score: c.health_score == null ? null : Number(c.health_score),
        }));

      // ── HR · HIRING ───────────────────────────────────────────────────────
      const trialCallsThisMonth = candidates.length;
      const passed = candidates.filter((c) => c.status === "passed").length;
      const failed = candidates.filter((c) => c.status === "failed").length;
      const pendingTrials = candidates.filter((c) => c.status === "pending").length;
      const hiredCandidates = candidates.filter((c) => c.status === "hired").length;
      const passRatePct =
        trialCallsThisMonth > 0
          ? (passed / trialCallsThisMonth) * 100
          : null;
      const newHires = setters.filter((s) => {
        const ref = s.start_date ?? s.created_at;
        return inWindow(ref);
      }).length;
      const activeTotalSetters = setters.filter(
        (s) =>
          s.active !== false &&
          s.is_test_account !== true &&
          setterUserIds.has(s.user_id),
      ).length;


      // ── GROWTH ────────────────────────────────────────────────────────────
      const ltvSum = activeClientList.reduce(
        (s, c) => s + Number(c.contract_value || 0),
        0,
      );
      const avgLtv = activeClientList.length > 0 ? ltvSum / activeClientList.length : 0;
      const growthInput = (growthInputRes.data as any) || null;
      const cac = growthInput?.cac_amount ?? null;
      const costToFulfil = growthInput?.cost_to_fulfil ?? null;
      const ltvCacRatio = cac && Number(cac) > 0 ? avgLtv / Number(cac) : null;

      // ── QA TEAM SCORES ────────────────────────────────────────────────────
      const qaBySetter = new Map<string, { sum: number; count: number; name: string | null; ratings: string[] }>();
      for (const row of callScores) {
        const key = String(row.setter_id ?? "");
        if (!key) continue;
        const cur = qaBySetter.get(key) || { sum: 0, count: 0, name: row.setter_name ?? null, ratings: [] };
        cur.sum += Number(row.weighted_total || 0);
        cur.count += 1;
        if (row.performance_rating) cur.ratings.push(row.performance_rating);
        qaBySetter.set(key, cur);
      }
      const setterById = new Map(setters.map((s) => [String(s.id), s.full_name]));
      // Pick the most common rating as representative
      const modeRating = (arr: string[]) => {
        if (!arr.length) return null;
        const tally: Record<string, number> = {};
        let best: string | null = null;
        let bestN = 0;
        for (const r of arr) {
          tally[r] = (tally[r] || 0) + 1;
          if (tally[r] > bestN) { bestN = tally[r]; best = r; }
        }
        return best;
      };
      const teamQaScores: TeamQaScore[] = Array.from(qaBySetter.entries()).map(
        ([setter_id, v]) => ({
          setter_id,
          setter_name: setterById.get(setter_id) ?? v.name ?? null,
          avg_score: v.count > 0 ? v.sum / v.count : 0,
          session_count: v.count,
          avg_rating: modeRating(v.ratings),
        }),
      ).sort((a, b) => b.avg_score - a.avg_score);
      const qaSessionsThisCycle = callScores.length;
      // W7: call_scores mixes departments — never average across them.
      // Each surface gets its own department-scoped mean; the org-wide
      // blend no longer exists.
      const deptQaMean = (dept: string) => {
        const rows = callScores.filter(
          (r: any) => String(r.department ?? "").toLowerCase() === dept,
        );
        return rows.length > 0
          ? rows.reduce((s: number, r: any) => s + Number(r.weighted_total || 0), 0) /
              rows.length
          : null;
      };
      const acqAvgQaScore = deptQaMean("acquisition");
      const fulAvgQaScore = deptQaMean("fulfilment");

      // ── PIF detection (payment >= 95% of contract_value) ─────────────────
      const clientAuthByClientId = new Map<string, string | null>(
        clientsRows.map((c: any) => [c.id, c.auth_user_id ?? null]),
      );
      const profileByUserId = new Map<string, any>();
      for (const p of clientProfiles) {
        if (p.user_id) profileByUserId.set(p.user_id, p);
      }
      const profileByClientId = (clientId: string | null) => {
        if (!clientId) return null;
        const uid = clientAuthByClientId.get(clientId);
        if (!uid) return null;
        return profileByUserId.get(uid) ?? null;
      };
      let pifPaymentCount = 0;
      for (const pay of payments) {
        const prof = profileByClientId(pay.client_id);
        if (!prof) continue;
        const cv = Number(prof.contract_value || 0);
        if (cv > 0 && Number(pay.amount || 0) >= cv * 0.95) pifPaymentCount += 1;
      }
      // Retainers = active clients with >1 client_payments row (lifetime
      // approximation using window payments — at least show recurring activity)
      const paymentsByClientId = new Map<string, number>();
      for (const pay of payments) {
        if (!pay.client_id) continue;
        paymentsByClientId.set(pay.client_id, (paymentsByClientId.get(pay.client_id) || 0) + 1);
      }
      // ── CLIENT CHURN ─────────────────────────────────────────────────────
      const clientChurnCount = clientProfiles.filter(
        (c) => (c.status === "inactive" || c.status === "churned") && inWindow(c.updated_at),
      ).length;
      const activeAtStart = activeClientList.length + clientChurnCount;
      const clientChurnPct = activeAtStart > 0 ? (clientChurnCount / activeAtStart) * 100 : null;

      // ── VACANCIES & POTENTIAL REVENUE ───────────────────────────────────
      // Live: prefer native CSM capture (catch-up feedback + imported opening
      // balances) once it has any data; until then the Client Health sheet
      // (matches CSM Portfolio), then sat fulfilment meetings as a last
      // resort. Backfill: per-client totals.
      const satFulfilmentMeetings = fulfilmentMeetings.filter((m: any) => isMeetingSat(m));
      const feedbackCatchups = (feedbackCatchupsRes?.data ??
        []) as unknown as CatchupFeedbackRow[];
      const openingBalances = (openingBalancesRes?.data ??
        []) as unknown as OpeningBalanceRow[];
      const nativeFeedbackLive = hasNativeClientFeedback(feedbackCatchups, openingBalances);
      const activeClientIds = activeClientList.map((c) => String(c.id));
      // Sheet fallback retired (ruling 2026-07-16): vacancies and potential
      // revenue come from native capture (catch-up feedback + opening
      // balances). If native has nothing, the meetings-table sum is the
      // only fallback — never the Google Sheet.
      const vacanciesGenerated = useBackfill
        ? activeClientList.reduce((s, c: any) => s + Number(c.vacancies || 0), 0)
        : nativeFeedbackLive
          ? sumVacancies(activeClientIds, feedbackCatchups, openingBalances)
          : satFulfilmentMeetings.reduce((s, m: any) => s + Number(m.vacancies_won || 0), 0);
      const potentialRevenue = useBackfill
        ? activeClientList.reduce((s, c: any) => s + Number(c.revenue_generated_potential || 0), 0)
        : nativeFeedbackLive
          ? sumPotentialRevenue(activeClientIds, feedbackCatchups, openingBalances)
          : satFulfilmentMeetings.reduce((s, m: any) => s + Number(m.vacancies_value || 0), 0);

      // ── TESTIMONIALS (native capture, windowed) ─────────────────────────
      // Error-aware: a failed query renders "—" on the tile, never a fake 0.
      const testimonialRows = (testimonialsRes?.data ?? null) as unknown as
        | { id: string; type: string; obtained_at: string }[]
        | null;
      const videoTestimonials =
        testimonialRows == null
          ? null
          : testimonialRows.filter((t) => t.type === "video").length;
      const writtenTestimonials =
        testimonialRows == null
          ? null
          : testimonialRows.filter((t) => t.type === "written").length;

      // ── UPSOLD CLIENTS (native capture, windowed) ───────────────────────
      // Distinct clients with a renewal or upsell logged in window.
      // Error-aware: "—" until the client_renewals migration runs.
      const renewalRows = (clientRenewalsRes?.data ?? null) as unknown as
        | { client_profile_id: string; kind: string; effective_date: string }[]
        | null;
      const upsoldClients =
        renewalRows == null
          ? null
          : new Set(renewalRows.map((r) => String(r.client_profile_id))).size;

      // ── LEAD LISTS (Client Health tile) ─────────────────────────────────
      // Currently-tracked lists (any status except rejected), split by the
      // CSM-tagged type. Error-aware: "—" until the migration runs.
      type LeadListRow = {
        id: string;
        client_profile_id: string;
        status?: string | null;
        list_type?: string | null;
        total_contacts?: number | null;
        is_default?: boolean | null;
      };
      const leadListRows = leadListsRes?.error
        ? null
        : ((leadListsRes?.data ?? []) as unknown as LeadListRow[]);
      const trackedLeadLists = (leadListRows ?? []).filter((l) => l.status !== "rejected");
      const leadListsTotal = leadListRows === null ? null : trackedLeadLists.length;
      const leadListsFulfilment =
        leadListRows === null ? null : trackedLeadLists.filter((l) => l.list_type === "fulfilment").length;
      const leadListsAcquisition =
        leadListRows === null ? null : trackedLeadLists.filter((l) => l.list_type === "acquisition").length;

      // Utilization (dial-based estimate), the owner-approved formula:
      // dials ÷ total_contacts, capped at 100% per list, aggregated as
      // Σ min(dials, contacts) ÷ Σ contacts over lists that have both a
      // contact count and assigned setters. Windowed via closeMetricsAll.
      const listAssignRows = listAssignmentsRes?.error
        ? null
        : ((listAssignmentsRes?.data ?? []) as unknown as {
            setter_id: string;
            client_id: string;
            lead_list_id?: string | null;
          }[]);
      let leadListsUtilizationPct: number | null = null;
      if (leadListRows !== null && listAssignRows !== null) {
        const defaultListByClient = new Map(
          trackedLeadLists.filter((l) => l.is_default).map((l) => [l.client_profile_id, l.id]),
        );
        const closeIdBySetterId = new Map(
          setters
            .map((s) => [String(s.id), s.close_user_id] as [string, string | null])
            .filter(([, c]) => c),
        );
        const setterCloseIdsByList = new Map<string, Set<string>>();
        for (const a of listAssignRows) {
          const listId = a.lead_list_id ?? defaultListByClient.get(a.client_id);
          if (!listId) continue;
          const closeId = closeIdBySetterId.get(String(a.setter_id));
          if (!closeId) continue;
          if (!setterCloseIdsByList.has(listId)) setterCloseIdsByList.set(listId, new Set());
          setterCloseIdsByList.get(listId)!.add(String(closeId));
        }
        let dialsCappedSum = 0;
        let contactsSum = 0;
        for (const list of trackedLeadLists) {
          const contacts = Number(list.total_contacts || 0);
          const closeIds = setterCloseIdsByList.get(list.id);
          if (contacts <= 0 || !closeIds?.size) continue;
          const dials = closeMetricsAll
            .filter((r) => closeIds.has(String(r.close_user_id)))
            .reduce((s: number, r) => s + Number(r.dials || 0), 0);
          dialsCappedSum += Math.min(dials, contacts);
          contactsSum += contacts;
        }
        if (contactsSum > 0) {
          leadListsUtilizationPct = Math.min(100, (dialsCappedSum / contactsSum) * 100);
        }
      }

      // ── % WATCHED TESTIMONIAL (acquisition sat meetings) ────────────────
      const satAcqMeetings = acquisitionMeetings.filter((m: any) => isMeetingSat(m));
      const watchedAcq = satAcqMeetings.filter((m: any) => m.prospect_watched_video === true).length;
      const acqWatchedTestimonialPct = satAcqMeetings.length > 0
        ? (watchedAcq / satAcqMeetings.length) * 100
        : null;

      // ── AVG DAYS BOOKED → SAT ───────────────────────────────────────────
      const daysBetween = (a?: string | null, b?: string | null) => {
        if (!a || !b) return null;
        const ta = Date.parse(a);
        const tb = Date.parse(b);
        if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
        return Math.max(0, (tb - ta) / 86400000);
      };
      const avgDays = (rows: any[]) => {
        const ds = rows
          .map((m: any) => daysBetween(m.created_at, m.meeting_date))
          .filter((n): n is number => n != null);
        return ds.length > 0 ? ds.reduce((s, n) => s + n, 0) / ds.length : null;
      };
      const avgDaysBookedToSatAcq = avgDays(satAcqMeetings);
      const avgDaysBookedToSatFul = avgDays(satFulfilmentMeetings);




      // ── AVG DAYS: CAMPAIGN START → FIRST MEETING BOOKED ────────────────
      const clientMeetingRows = clientMeetingsRes.data ?? [];
      const firstBookedByClient = new Map<string, number>();
      for (const m of clientMeetingRows) {
        const cid = String(m.client_profile_id ?? "");
        const t = Date.parse(m.created_at);
        if (!cid || !Number.isFinite(t)) continue;
        const cur = firstBookedByClient.get(cid);
        if (cur == null || t < cur) firstBookedByClient.set(cid, t);
      }
      const daysToFirstMeeting = activeClientList
        .map((c) => {
          if (!c.campaign_start_date) return null;
          const start = Date.parse(c.campaign_start_date);
          const first = firstBookedByClient.get(String(c.id));
          if (!Number.isFinite(start) || first == null) return null;
          return Math.max(0, (first - start) / 86400000);
        })
        .filter((n): n is number => n != null);
      const avgDaysToFirstMeeting =
        daysToFirstMeeting.length > 0
          ? daysToFirstMeeting.reduce((a, b) => a + b, 0) / daysToFirstMeeting.length
          : null;

      // ── WEEKLY GOALS: hit % + 3wk streak (operational goal_met) ────────
      const weeklyGoalRows = weeklyGoalsRes.data ?? [];
      const goalsByClient = new Map<string, typeof weeklyGoalRows>();
      for (const g of weeklyGoalRows) {
        const cid = String(g.client_id ?? "");
        if (!cid) continue;
        const arr = goalsByClient.get(cid) || [];
        arr.push(g);
        goalsByClient.set(cid, arr);
      }
      const goalTodayMs = Date.now();
      // N11 happiness, dual-score model: the metric score (hitting AND
      // streak, per client) and the CSM-subjective score (csm_happy from
      // the weekly catch-up) are aggregated SEPARATELY — never blended.
      // CSM scores load isolated — pre-migration the tile is metric-only,
      // never broken.
      const csmHappyByClient = new Map<string, boolean>();
      const csmScoresAvailable = !csmHappinessRes?.error;
      if (csmScoresAvailable) {
        for (const r of (csmHappinessRes?.data ?? []) as unknown as {
          id: string;
          csm_happy: boolean | null;
        }[]) {
          if (r.csm_happy !== null && r.csm_happy !== undefined)
            csmHappyByClient.set(String(r.id), r.csm_happy);
        }
      }
      let goalEligible = 0;
      let hittingWeeklyTarget = 0;
      let onStreak3w = 0;
      let metricHappyClients = 0;
      let csmAssessed = 0;
      let csmHappyClients = 0;
      for (const c of activeClientList) {
        const goals = goalsByClient.get(String(c.id)) ?? [];
        const completedWeeks = goals
          .filter((g) => Date.parse(g.week_end) < goalTodayMs)
          .sort((a, b) => b.week_number - a.week_number);
        const hitting = completedWeeks.length > 0 && completedWeeks[0].goal_met === true;
        const streak = getConsecutiveStreak(goals as unknown as WeeklyGoal[]) >= 3;
        if (hitting && streak) metricHappyClients += 1;
        const csm = csmHappyByClient.get(String(c.id));
        if (csm !== undefined) {
          csmAssessed += 1;
          if (csm) csmHappyClients += 1;
        }
        if (completedWeeks.length === 0) continue;
        goalEligible += 1;
        if (hitting) hittingWeeklyTarget += 1;
        if (streak) onStreak3w += 1;
      }
      const pctClientsHittingWeeklyTarget =
        goalEligible > 0 ? (hittingWeeklyTarget / goalEligible) * 100 : null;
      const pctClientsOnStreak3w =
        goalEligible > 0 ? (onStreak3w / goalEligible) * 100 : null;
      const pctClientsHappyMetric =
        activeClientList.length > 0
          ? (metricHappyClients / activeClientList.length) * 100
          : null;
      // Denominator = assessed active clients only; NULL means "never
      // assessed", never "unhappy".
      const pctClientsHappyCSM =
        csmScoresAvailable && csmAssessed > 0
          ? (csmHappyClients / csmAssessed) * 100
          : null;
      const csmHappyAssessedCount = csmScoresAvailable ? csmAssessed : null;

      // ── ONBOARDING COMPLETIONS (stage 6 reached in window) ─────────────
      // Explicit error check: a failed query renders "—", not a fake 0.
      const newClientsOnboarded = onboardingCompletedRes.error
        ? null
        : (onboardingCompletedRes.data ?? []).length;

      // ── CATCHUPS / OVERDUE ──────────────────────────────────────────────
      const catchupsThisCycle = catchupsWindow.length;
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const recentCatchupClientIds = new Set(
        catchupsAll
          .filter((c: any) => c.scheduled_date && Date.parse(c.scheduled_date) >= fourteenDaysAgo.getTime())
          .map((c: any) => c.client_profile_id),
      );
      const clientsOverdueCatchup = activeClientList.filter(
        (c) => !recentCatchupClientIds.has(c.id),
      ).length;

      // ── MEETING QUALITY ──────────────────────────────────────────────────
      const scoreOf = (s: any) =>
        s.overall_quality != null
          ? Number(s.overall_quality)
          : (Number(s.fit || 0) + Number(s.engagement || 0) + Number(s.authority || 0) + Number(s.next_step || 0)) / 4;
      const msScores = meetingScores
        .map(scoreOf)
        .filter((n) => Number.isFinite(n) && n > 0);
      const avgMeetingQuality = msScores.length > 0
        ? msScores.reduce((a, b) => a + b, 0) / msScores.length
        : null;
      // Fulfilment-scoped appointment QA: only meeting_scores whose
      // appointment_id belongs to a fulfilment meeting in window.
      const fulfilmentMeetingIds = new Set(
        fulfilmentMeetings.map((m: any) => String(m.id ?? "")).filter(Boolean),
      );
      const fulMsScores = meetingScores
        .filter((s: any) => fulfilmentMeetingIds.has(String(s.appointment_id ?? "")))
        .map(scoreOf)
        .filter((n) => Number.isFinite(n) && n > 0);
      const avgFulAppointmentQaScore = fulMsScores.length > 0
        ? fulMsScores.reduce((a, b) => a + b, 0) / fulMsScores.length
        : null;


      // ── CLOSE METRICS (acquisition + fulfilment) ─────────────────────────
      const acquisitionCloseUserIds = new Set(
        setters
          .filter((s) => s.department === "acquisition" && s.close_user_id)
          .map((s) => String(s.close_user_id)),
      );
      const fulfilmentCloseUserIds = new Set(
        setters
          .filter((s) => s.department === "fulfilment" && s.close_user_id)
          .map((s) => String(s.close_user_id)),
      );
      const sumClose = (filter: (r: any) => boolean, field: string) =>
        closeMetrics.filter(filter).reduce((s, r: any) => s + Number(r[field] || 0), 0);
      const acqDialsClose = sumClose(
        (r) => r.department === "acquisition" || acquisitionCloseUserIds.has(String(r.close_user_id)),
        "dials",
      );
      const acqTalkSecondsClose = sumClose(
        (r) => r.department === "acquisition" || acquisitionCloseUserIds.has(String(r.close_user_id)),
        "talk_time_seconds",
      );
      const acqConnects3 = sumClose(
        (r) => r.department === "acquisition" || acquisitionCloseUserIds.has(String(r.close_user_id)),
        "connects_3_plus_mins",
      );
      const acqConnects = sumClose(
        (r) => r.department === "acquisition" || acquisitionCloseUserIds.has(String(r.close_user_id)),
        "connects",
      );
      const hasFulfilmentCloseData = closeMetrics.some(
        (r: any) => r.department === "fulfilment" || fulfilmentCloseUserIds.has(String(r.close_user_id)),
      );
      const fulDialsClose = sumClose(
        (r) => r.department === "fulfilment" || fulfilmentCloseUserIds.has(String(r.close_user_id)),
        "dials",
      );
      const fulTalkSecondsClose = sumClose(
        (r) => r.department === "fulfilment" || fulfilmentCloseUserIds.has(String(r.close_user_id)),
        "talk_time_seconds",
      );
      const fulConnects3 = sumClose(
        (r) => r.department === "fulfilment" || fulfilmentCloseUserIds.has(String(r.close_user_id)),
        "connects_3_plus_mins",
      );
      const fulConnects = sumClose(
        (r) => r.department === "fulfilment" || fulfilmentCloseUserIds.has(String(r.close_user_id)),
        "connects",
      );

      // Acquisition: prefer Close, fall back to manual
      const acqFinalDials = useBackfill
        ? bfAcqDials
        : (acqDialsClose > 0 ? acqDialsClose : acqDials);
      const acqFinalTalkSeconds = useBackfill
        ? bfAcqTalkSeconds
        : (acqTalkSecondsClose > 0 ? acqTalkSecondsClose : acqTalkTime * 60);

      // Fulfilment fallback
      const fulFinalDials = useBackfill
        ? bfFulDials
        : (fulDialsClose > 0 ? fulDialsClose : teamDials);
      const fulFinalTalkSeconds = useBackfill
        ? bfFulTalkSeconds
        : (fulTalkSecondsClose > 0 ? fulTalkSecondsClose : teamTalkTime * 60);

      // ── HEADCOUNT / PROBATION ────────────────────────────────────────────
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const activeSettersAll = setters.filter(
        (s) => s.active !== false && s.is_test_account !== true && setterUserIds.has(s.user_id),
      );
      const acquisitionActive = activeSettersAll.filter((s) => s.department === "acquisition").length;
      const fulfilmentActive = activeSettersAll.filter((s) => s.department === "fulfilment").length;
      
      const passedProbation = activeSettersAll.filter((s) => {
        const sd = s.start_date ?? s.created_at;
        return sd && Date.parse(sd) < ninetyDaysAgo.getTime();
      }).length;
      const inProbation = activeSettersAll.filter((s) => {
        const sd = s.start_date ?? s.created_at;
        return sd && Date.parse(sd) >= ninetyDaysAgo.getTime();
      }).length;
      // W10: SDR churn as a real RATE, properly scoped — fulfilment
      // department, genuine setter role, non-test. Denominator approximates
      // headcount at window start (active now + churned in window); exact
      // once offboarding records real end dates (Build 4). updated_at is a
      // churn-date proxy until then — any row edit re-dates a churn.
      const churnPopulation = setters.filter(
        (s: any) =>
          s.department === "fulfilment" &&
          s.is_test_account !== true &&
          setterUserIds.has(s.user_id),
      );
      const sdrChurnInWindow = churnPopulation.filter(
        (s: any) => s.active === false && inWindow(s.updated_at),
      ).length;
      const sdrTeamAtWindowStart =
        churnPopulation.filter((s: any) => s.active === true).length + sdrChurnInWindow;
      const sdrChurnRatePct =
        sdrTeamAtWindowStart > 0
          ? (sdrChurnInWindow / sdrTeamAtWindowStart) * 100
          : null;
      const lctToHirePct = trialCallsThisMonth > 0 ? (newHires / trialCallsThisMonth) * 100 : null;

      // W17: real attendance where recorded (isolated query), verdict
      // proxy for legacy rows so history doesn't blank out.
      const lctAttendanceById = new Map<string, string | null>();
      if (!lctAttendanceRes?.error) {
        for (const r of (lctAttendanceRes?.data ?? []) as unknown as {
          id: string;
          lct_attendance: string | null;
        }[]) {
          lctAttendanceById.set(String(r.id), r.lct_attendance ?? null);
        }
      }
      let lctShowedUp = 0;
      let lctAttendanceRecordedCount = 0;
      for (const c of candidates) {
        const att = lctAttendanceById.get(String(c.id)) ?? null;
        if (att !== null) {
          lctAttendanceRecordedCount += 1;
          if (att === "attended") lctShowedUp += 1;
        } else if (c.status === "passed" || c.status === "failed") {
          lctShowedUp += 1;
        }
      }

      // N19: % setters hitting target — trailing-7-day fulfilment bookings
      // (rebooks excluded) vs each setter's weekly meetings target.
      // Isolated queries: pre-migration this renders "—", never a fake 0.
      let pctSettersHittingTarget: number | null = null;
      let settersHittingTarget = 0;
      let settersTargetEligible = 0;
      if (!(setterTargetsRes as any)?.error && !trailing7dMeetingsRes?.error) {
        const weeklyTargetBySetter = new Map<string, number>();
        for (const t of ((setterTargetsRes as any)?.data ?? []) as any[]) {
          weeklyTargetBySetter.set(
            String(t.setter_profile_id),
            Number(t.weekly_meetings_target ?? 6),
          );
        }
        const booked7dBySetter = new Map<string, number>();
        for (const m of (trailing7dMeetingsRes?.data ?? []) as any[]) {
          const sid = String(m.setter_profile_id ?? "");
          if (!sid) continue;
          booked7dBySetter.set(sid, (booked7dBySetter.get(sid) ?? 0) + 1);
        }
        const targetPopulation = setters.filter(
          (s: any) =>
            s.department === "fulfilment" &&
            s.active === true &&
            s.is_test_account !== true &&
            setterUserIds.has(s.user_id),
        );
        settersTargetEligible = targetPopulation.length;
        settersHittingTarget = targetPopulation.filter((s: any) => {
          const target = weeklyTargetBySetter.get(String(s.id)) ?? 6;
          return (booked7dBySetter.get(String(s.id)) ?? 0) >= target;
        }).length;
        pctSettersHittingTarget =
          settersTargetEligible > 0
            ? (settersHittingTarget / settersTargetEligible) * 100
            : null;
      }

      // Recruiter (HR-function) telemetry. setters_profiles rows with
      // department 'hr' exist only to hold a Close user ID pasted in the
      // Employee Hub — they are excluded from setter headcount/leaderboards
      // by the setter-role filter above. Null until an ID is configured so
      // the tile renders "—" rather than a fake 0.
      const hrCloseUserIds = new Set(
        setters
          .filter((s) => s.department === "hr" && s.close_user_id)
          .map((s) => String(s.close_user_id)),
      );
      const hrCloseRows = closeMetricsAll.filter((r) =>
        hrCloseUserIds.has(String(r.close_user_id ?? "")),
      );
      const recruiterDials =
        hrCloseUserIds.size > 0
          ? hrCloseRows.reduce((s, r) => s + Number(r.dials || 0), 0)
          : null;
      const recruiterTalkSeconds =
        hrCloseUserIds.size > 0
          ? hrCloseRows.reduce((s, r) => s + Number(r.talk_time_seconds || 0), 0)
          : null;

      // ── HIRING PIPELINE (N15–N17) ────────────────────────────────────────
      // Cohort-based: denominator = candidates whose stage date falls in the
      // window; numerator = the cohort subset that progressed onward at any
      // time. Null (→ "—") until the pipeline migration is applied.
      type HiringPipelineRow = {
        sdr_interview_date?: string | null;
        offer_letter_date?: string | null;
        accepted_date?: string | null;
      };
      const hpRows = hiringPipelineRes?.error
        ? null
        : ((hiringPipelineRes?.data ?? []) as unknown as HiringPipelineRow[]);
      const winStartDay = startISO.slice(0, 10);
      const winEndDay = endISO.slice(0, 10);
      const dayInWindow = (d: unknown) =>
        typeof d === "string" && d >= winStartDay && d <= winEndDay;
      const interviewCohort = (hpRows ?? []).filter((c) => dayInWindow(c.sdr_interview_date));
      const offerCohort = (hpRows ?? []).filter((c) => dayInWindow(c.offer_letter_date));
      const finalInterviewsBooked = hpRows === null ? null : interviewCohort.length;
      const interviewToOfferPct =
        hpRows === null || interviewCohort.length === 0
          ? null
          : (interviewCohort.filter((c) => c.offer_letter_date).length / interviewCohort.length) * 100;
      const offerAcceptancePct =
        hpRows === null || offerCohort.length === 0
          ? null
          : (offerCohort.filter((c) => c.accepted_date).length / offerCohort.length) * 100;

      // ── FINANCE ──────────────────────────────────────────────────────────
      const invoicesPaidInWindow = invoices.filter((i: any) => i.status === "paid" && inWindow(i.paid_at));
      const cashPaidWindow = invoicesPaidInWindow.reduce((s, i: any) => s + Number(i.amount || 0), 0);
      const invoicesOpen = invoices.filter((i: any) => i.status === "sent" || i.status === "overdue");
      const outstanding = invoicesOpen.reduce((s, i: any) => s + Number(i.amount || 0), 0);
      // 9 Oct 2026: nothing flips invoices.status to "overdue"; overdue means
      // sent and past its due date (same rule as CEO → Invoices "past due").
      const todayIso = format(new Date(), "yyyy-MM-dd");
      const overdueInvoices = invoicesOpen.filter((i: any) => i.status === "overdue" || (i.due_date && String(i.due_date) < todayIso));
      const overdueAmount = overdueInvoices.reduce((s, i: any) => s + Number(i.amount || 0), 0);

      return {
        windowLabel: `${format(window.start, "d MMM")} – ${format(window.end, "d MMM yyyy")}`,
        cashSource,
        qaSessionsThisCycle,
        teamQaScores,
        activeTotalSetters,
        sdrManagerQaSessions,
        sdrManagerAvgQaScore,
        overall: {
          cashCollected: mergedCashCollected,
          cashSource: useBackfill ? ("unavailable" as any) : cashSource,
          cashBasis,
          activeClients,
          discosBookedAll: overallDiscosBookedAll,
          discosSat: overallDiscosSat,
          cac,
          satFulfilmentMeetings: satFulfilmentMeetings.length,
          clientChurnCount,
          clientChurnPct,
          vacanciesGenerated,
          potentialRevenue,
        },
        sales: {
          dealsClosed: mergedDealsClosed,
          pifs: mergedPifs,
          pifPaymentCount: useBackfill ? null : pifPaymentCount,
          retainers: mergedRetainers,
          contractValueClosed: mergedContractValueClosed,
          cashCollected: mergedCashCollected,
          cashBasis,

          newCashCollected: newCashCollectedExVat,
          newCashCollectedExVat,
          pipelineReengagementBooked,
          daysSinceLastClose,
          discoToClosePct,
          totalCashBanked: paymentsSum,
          newCashSource: "actual" as any,
          discoSat,
          followUpSat,
          discoToFollowPct,
          followUpShowUpPct,
          closingPct,
          closingPending,
          totalFollowUps: pitchWindow.length,
          totalDiscoveries: discoWindow.length,
          activeAEs,
          activeAcquisitionSetters,
        },
        acquisition: {
          meetingsBooked: useLive ? acqBookedByCreatedCount : acqMeetings,
          meetingsBookedByMeetingDate: acqMeetings,
          discosSat: overallDiscosSat,
          showUpRatePct: computeSitRatePct(overallDiscosSat, overallDiscosBookedAll),
          dials: acqFinalDials,
          dialsToBookingRatio:
            overallDiscosBookedAll > 0 ? acqFinalDials / overallDiscosBookedAll : null,
          talkTimeSeconds: acqFinalTalkSeconds,
          talkPerBookingSeconds:
            overallDiscosBookedAll > 0 ? acqFinalTalkSeconds / overallDiscosBookedAll : null,
          connects3Plus: useBackfill ? null : acqConnects3,
          connectToConversationPct: useBackfill
            ? null
            : acqConnects > 0
              ? (acqConnects3 / acqConnects) * 100
              : null,
          warmLeads: useBackfill ? bfAcqWarmLeads : null,
          avgQaScore: useBackfill ? null : acqAvgQaScore,
          rebooks: acqRebooks,
          activeSetters: activeAcquisitionSetters,
          watchedTestimonialPct: useBackfill ? null : acqWatchedTestimonialPct,
          avgDaysBookedToSat: useBackfill ? null : avgDaysBookedToSatAcq,
        },
        fulfilment: {
          teamMeetingsSat,
          showUpRatePct: computeSitRatePct(teamMeetingsSat, appointmentsBooked),
          teamDials: fulFinalDials,
          dialsToBookingRatio:
            appointmentsBooked > 0 ? fulFinalDials / appointmentsBooked : null,
          teamTalkSeconds: fulFinalTalkSeconds,
          talkPerBookingSeconds:
            appointmentsBooked > 0 ? fulFinalTalkSeconds / appointmentsBooked : null,
          connects3Plus: useBackfill ? null : (hasFulfilmentCloseData ? fulConnects3 : null),
          connectToConversationPct: useBackfill
            ? null
            : hasFulfilmentCloseData && fulConnects > 0
              ? (fulConnects3 / fulConnects) * 100
              : null,
          warmLeads: useBackfill
            ? bfFulWarmLeads
            : fulWarmRows.length > 0
              ? manualFulWarmLeads
              : null,
          avgQaScore: useBackfill ? null : fulAvgQaScore,
          avgAppointmentQaScore: avgFulAppointmentQaScore,
          avgMoodScore,
          pctSettersHappy,
          vacanciesGenerated,
          potentialRevenue,
          avgDaysBookedToSat: useBackfill ? null : avgDaysBookedToSatFul,
          hasCloseData: hasFulfilmentCloseData,
          pendingConfirmation: fulfilmentPendingCount,
          activeFulfilmentSetters,
          activeFulfilmentSettersExclMgr,
          teamAvgMeetingsPerSetter,
          appointmentsSet,
          appointmentsBooked: useLive ? fulBookedByCreatedCount : appointmentsBooked,
          appointmentsBookedByMeetingDate: appointmentsBooked,
          satMeetingsCount: teamMeetingsSat,
          teamSatRatePct,
          avgClientHealth,
          activeClients,
          rampedPct: fulRampedPct,
          rampedCount: fulRamped,
          rampClassifiedCount: fulRampClassified.length,
          pctSettersHittingTarget,
          settersHittingTarget,
          settersTargetEligible,
          lowestHealthClients,
          sdrManager: {
            dials: sdrManagerDials,
            talkTimeMinutes: sdrManagerTalkTime,
            meetingsBooked: sdrManagerMeetings,
            coachingSessions: sdrManagerCoachingSessions,
            benchmarkPct:
              teamAvgMeetingsPerSetter > 0
                ? (sdrManagerMeetings / teamAvgMeetingsPerSetter) * 100
                : null,
          },
        },
        csm: {
          activeClients,
          clientChurnCount,
          clientChurnPct,
          avgClientHealth,
          catchupsThisCycle,
          clientsOverdueCatchup,
          vacanciesGenerated,
          potentialRevenue,
          avgMeetingQuality,
          newClientsOnboarded,
          avgDaysToFirstMeeting,
          pctClientsHittingWeeklyTarget,
          pctClientsOnStreak3w,
          pctClientsHappyMetric,
          pctClientsHappyCSM,
          csmHappyAssessedCount,
          videoTestimonials,
          writtenTestimonials,
          upsoldClients,
          leadListsTotal,
          leadListsFulfilment,
          leadListsAcquisition,
          leadListsUtilizationPct,
        },
        hiring: {
          trialCallsThisMonth,
          trialCallsThisWindow: trialCallsThisMonth,
          passed,
          failed,
          pending: pendingTrials,
          hired: hiredCandidates,
          passRatePct,
          newHires,
          activeTotalSetters,
          acquisitionActive,
          fulfilmentActive,
          passedProbation,
          inProbation,
          sdrChurnInWindow,
          sdrChurnRatePct,
          sdrTeamAtWindowStart,
          lctToHirePct,
          // LCT sat = candidates whose LCT has a verdict (passed or failed).
          lctSatCount: passed + failed,
          // W17: show-up from real attendance where recorded; candidates
          // without an attendance value fall back to the verdict proxy.
          lctShowUpPct:
            trialCallsThisMonth > 0
              ? (lctShowedUp / trialCallsThisMonth) * 100
              : null,
          lctAttendanceRecordedCount,
          // Recruiter telemetry — sums Close dials/talk time for users whose
          // setters_profiles row has department 'hr' + a close_user_id
          // (pasted via the Employee Hub). Null until an ID is configured.
          recruiterDials,
          recruiterTalkSeconds,
          finalInterviewsBooked,
          interviewToOfferPct,
          offerAcceptancePct,
        },
        finance: {
          cashPaidWindow,
          invoicesPaidCount: invoicesPaidInWindow.length,
          newClientPayments: payments.reduce((s, p: any) => s + Number(p.amount || 0), 0),
          pifPaymentCount,
          outstanding,
          openInvoiceCount: invoicesOpen.length,
          overdueCount: overdueInvoices.length,
          overdueAmount,
          // Unit economics (from ceo_growth_inputs manual inputs)
          cac,
          costToFulfil,
          avgLtv,
          ltvCacRatio,
          marginPerClient:
            avgLtv != null && costToFulfil != null ? avgLtv - Number(costToFulfil) : null,
          avgRevenuePerClient: avgLtv,
          avgRevenuePerTeamMember:
            avgLtv > 0 && activeClients > 0 && activeTotalSetters > 0
              ? (avgLtv * activeClients) / activeTotalSetters
              : null,
          // Fulfilment cost efficiency — needs monthly opex feed
          fulfilmentBookedCount: appointmentsBooked,
          fulfilmentSatCount: teamMeetingsSat,
          costPerBookedMeeting: null as number | null,
          costPerSatMeeting: null as number | null,
          // Margins & retention — awaiting P&L feed
          grossMarginPct: null as number | null,
          netMarginPct: null as number | null,
          nrrPct: null as number | null,
          revenueGrowthPct: null as number | null,
          // Cash position — awaiting bank / cash-flow input
          freeCashFlow: null as number | null,
          cashOnHand: null as number | null,
          avgProfitPerTeamMember: null as number | null,
        },
        growth: {
          activeClients,
          newClientsThisMonth: newClientsInWindow,
          avgLtv,
          cac,
          costToFulfil,
          ltvCacRatio,
          marketingSpend: growthInput?.marketing_spend ?? null,
          currency: growthInput?.currency ?? "GBP",
          rawInput: growthInput,
        },
      };
    },
  });
}
