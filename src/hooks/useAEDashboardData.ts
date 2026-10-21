import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { getUniqueConvertedDeals, sumConvertedDealValue } from "@/lib/convertedDeals";

interface PipelineStage {
  name: string;
  count: number;
  value: number;
  color: string;
}

interface ForecastRow {
  month: string;
  contractValue: number;
  expectingToClose: number;
  forecastedValue: number;
}

interface PipelineItem {
  id: string;
  company: string;
  client: string;
  value: number;
  stage: "discovery" | "follow_up" | "ready" | "won";
  date?: string;
}

interface TodaysFocus {
  discoveryCallsToday: number;
  followUpCallsToday: number;
  actionRequired: number;
  overdueOutcomes: number;
}

interface QuickPulse {
  showUpRate: number;
  closeRate: number;
  mtdValue: number;
}

export interface AEDashboardData {
  profile: {
    name: string;
    mtdContractValue: number;
    dealsCount: number;
    leaderboardPosition: number | null;
  };
  pipeline: PipelineStage[];
  forecast: ForecastRow[];
  todaysFocus: TodaysFocus;
  quickPulse: QuickPulse;
  activePipeline: PipelineItem[];
  isLoading: boolean;
  error: string | null;
  hasOverride: boolean;
}

export function useAEDashboardData() {
  const { user } = useAuth();
  const subjectId = user?.id;
  const [data, setData] = useState<AEDashboardData>({
    profile: {
      name: "",
      mtdContractValue: 0,
      dealsCount: 0,
      leaderboardPosition: null,
    },
    pipeline: [],
    forecast: [],
    todaysFocus: {
      discoveryCallsToday: 0,
      followUpCallsToday: 0,
      actionRequired: 0,
      overdueOutcomes: 0,
    },
    quickPulse: {
      showUpRate: 0,
      closeRate: 0,
      mtdValue: 0,
    },
    activePipeline: [],
    isLoading: true,
    error: null,
    hasOverride: false,
  });

  const loadData = useCallback(async () => {
    setData(prev => ({ ...prev, isLoading: true, error: null }));

    if (!subjectId) {
      setData(prev => ({ ...prev, isLoading: false, error: null }));
      return;
    }

    try {
      const today = new Date();
      const todayStr = format(today, "yyyy-MM-dd");
      const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");
      const accessibleMeetingFilter = `assigned_ae_id.eq.${subjectId},assigned_ae_id.is.null`;

      // First check if there's an override for this AE for this month
      let overrideData: {
        total_discovery: number;
        qualified_discovery: number;
        no_shows: number;
        lead_followups: number;
        total_closes: number;
        contract_value: number;
        cash_collected: number;
      } | null = null;

      const { data: overrides } = await supabase
        .from("ae_metrics_overrides")
        .select("*")
        .eq("ae_user_id", subjectId)
        .lte("period_start", monthEnd)
        .gte("period_end", monthStart)
        .order("created_at", { ascending: false })
        .limit(1);
      const override = overrides?.[0] ?? null;

      if (override) {
        overrideData = override;
      }

      const [
        accessibleTodayMeetingsResult,
        accessibleOverdueMeetingsResult,
        accessibleUpcomingMeetingsResult,
        ownedMonthMeetingsResult,
        myPitchCallsResult,
      ] = await Promise.all([
        supabase
          .from("meetings")
          .select("id")
          .eq("department", "acquisition")
          .or(accessibleMeetingFilter)
          .eq("meeting_date", todayStr),
        supabase
          .from("meetings")
          .select("id")
          .eq("department", "acquisition")
          .or(accessibleMeetingFilter)
          .lt("meeting_date", todayStr),
        supabase
          .from("meetings")
          .select("id, company_name")
          .eq("department", "acquisition")
          .or(accessibleMeetingFilter)
          .gte("meeting_date", todayStr)
          .is("client_outcome", null),
        supabase
          .from("meetings")
          .select("id")
          .eq("department", "acquisition")
          .eq("assigned_ae_id", subjectId)
          .gte("meeting_date", monthStart)
          .lte("meeting_date", monthEnd),
        supabase
          .from("pitch_calls")
          .select("id, client_name, contract_value, converted_to_client, discovery_log_id, pitch_call_date, status, marked_not_proceeding, updated_at")
          .eq("created_by", subjectId)
          .order("created_at", { ascending: false }),
      ]);

      const ownedMeetingIds = (ownedMonthMeetingsResult.data || []).map((meeting) => meeting.id);
      let ownedSatLogs: Array<{ id: string; meeting_id: string | null }> = [];
      let convertedDiscovery: Array<{ id: string; contract_value: number | null; updated_at?: string | null }> = [];

      if (ownedMeetingIds.length > 0) {
        const [ownedSatLogsResult, convertedDiscoveryResult] = await Promise.all([
          supabase
            .from("sales_discovery_logs")
            .select("id, meeting_id")
            .eq("outcome", "sat")
            .in("meeting_id", ownedMeetingIds)
            .gte("meeting_at", `${monthStart}T00:00:00`)
            .lte("meeting_at", `${monthEnd}T23:59:59`),
          supabase
            .from("sales_discovery_logs")
            .select("id, contract_value, updated_at")
            .eq("converted_to_client", true)
            .in("meeting_id", ownedMeetingIds)
            .gte("updated_at", `${monthStart}T00:00:00`)
            .lte("updated_at", `${monthEnd}T23:59:59`),
        ]);

        ownedSatLogs = ownedSatLogsResult.data || [];
        convertedDiscovery = convertedDiscoveryResult.data || [];
      }

      const myPitchCalls = myPitchCallsResult.data || [];
      const activePitchCalls = myPitchCalls.filter((pitchCall) => !pitchCall.converted_to_client && !pitchCall.marked_not_proceeding);
      const inFollowUpCalls = activePitchCalls.filter((pitchCall) => pitchCall.status !== "completed");
      const readyCalls = activePitchCalls.filter((pitchCall) => pitchCall.status === "completed");
      const todayFollowUpsCount = myPitchCalls.filter(
        (pitchCall) => pitchCall.pitch_call_date === todayStr && pitchCall.status !== "completed" && !pitchCall.converted_to_client && !pitchCall.marked_not_proceeding,
      ).length;

      const convertedPitch = myPitchCalls.filter(
        (pitchCall) =>
          pitchCall.converted_to_client &&
          !!pitchCall.updated_at &&
          pitchCall.updated_at >= `${monthStart}T00:00:00` &&
          pitchCall.updated_at <= `${monthEnd}T23:59:59`,
      );

      const uniqueDeals = getUniqueConvertedDeals(convertedPitch, convertedDiscovery);
      const mtdContractValue = sumConvertedDealValue(uniqueDeals);
      const dealsCount = uniqueDeals.length;

      let overdueCount = 0;
      if (accessibleOverdueMeetingsResult.data && accessibleOverdueMeetingsResult.data.length > 0) {
        const overdueIds = accessibleOverdueMeetingsResult.data.map((meeting) => meeting.id);
        const { data: existingLogs } = await supabase
          .from("sales_discovery_logs")
          .select("meeting_id")
          .in("meeting_id", overdueIds);

        const loggedMeetingIds = new Set(existingLogs?.map((log) => log.meeting_id) || []);
        overdueCount = overdueIds.filter((id) => !loggedMeetingIds.has(id)).length;
      }

      // If we have an override, use those values for profile metrics
      if (overrideData) {
        const discoveryCount = accessibleUpcomingMeetingsResult.data?.length || 0;
        const inFollowUpValue = inFollowUpCalls.reduce((sum, pitchCall) => sum + (pitchCall.contract_value || 0), 0);
        const readyValue = readyCalls.reduce((sum, pitchCall) => sum + (pitchCall.contract_value || 0), 0);

        const pipeline: PipelineStage[] = [
          { name: "Discovery", count: discoveryCount, value: 0, color: "hsl(221, 73%, 55%)" },
          { name: "Follow-up", count: inFollowUpCalls.length, value: inFollowUpValue, color: "hsl(38, 92%, 50%)" },
          { name: "Ready", count: readyCalls.length, value: readyValue, color: "hsl(217, 91%, 60%)" },
          { name: "Won", count: overrideData.total_closes, value: overrideData.contract_value, color: "hsl(142, 69%, 45%)" },
        ];

        const dealsWithContractValue = inFollowUpCalls.filter((pitchCall) => (pitchCall.contract_value || 0) > 0);
        const totalPipelineValue = dealsWithContractValue.reduce((sum, pitchCall) => sum + (pitchCall.contract_value || 0), 0);
        const avgContractValue = dealsWithContractValue.length > 0
          ? Math.round(totalPipelineValue / dealsWithContractValue.length)
          : 0;

        const forecast: ForecastRow[] = [];
        for (let i = 0; i < 3; i++) {
          const monthDate = addMonths(today, i);
          const monthLabel = format(monthDate, "MMM yyyy");
          forecast.push({
            month: monthLabel,
            contractValue: i === 0 ? avgContractValue : 0,
            expectingToClose: i === 0 ? dealsWithContractValue.length : 0,
            forecastedValue: i === 0 ? dealsWithContractValue.length * avgContractValue : 0,
          });
        }

        const showUpRate = overrideData.total_discovery > 0 
          ? Math.round((overrideData.qualified_discovery / overrideData.total_discovery) * 100) 
          : 0;
        const closeRate = overrideData.lead_followups > 0 
          ? Math.round((overrideData.total_closes / overrideData.lead_followups) * 100) 
          : 0;

        const activePipeline: PipelineItem[] = activePitchCalls.slice(0, 10).map((item) => ({
          id: item.id,
          company: item.client_name || "Unknown",
          client: item.client_name || "Unknown",
          value: item.contract_value || 0,
          stage: item.status === "completed" ? "ready" : "follow_up",
          date: item.pitch_call_date,
        }));

        setData({
          profile: {
            name: "",
            mtdContractValue: overrideData.contract_value,
            dealsCount: overrideData.total_closes,
            leaderboardPosition: overrideData.total_closes > 0 ? 1 : null,
          },
          pipeline,
          forecast,
          todaysFocus: {
            discoveryCallsToday: accessibleTodayMeetingsResult.data?.length || 0,
            followUpCallsToday: todayFollowUpsCount,
            actionRequired: overdueCount + todayFollowUpsCount,
            overdueOutcomes: overdueCount,
          },
          quickPulse: {
            showUpRate,
            closeRate,
            mtdValue: overrideData.contract_value,
          },
          activePipeline,
          isLoading: false,
          error: null,
          hasOverride: true,
        });
        return;
      }

      // Process pipeline stages
      const upcomingCount = accessibleUpcomingMeetingsResult.data?.length || 0;
      const inFollowUpCount = inFollowUpCalls.length;
      const inFollowUpValue = inFollowUpCalls.reduce((sum, pitchCall) => sum + (pitchCall.contract_value || 0), 0);
      const readyCount = readyCalls.length;
      const readyValue = readyCalls.reduce((sum, pitchCall) => sum + (pitchCall.contract_value || 0), 0);

      const pipeline: PipelineStage[] = [
        { name: "Discovery", count: upcomingCount, value: 0, color: "hsl(221, 73%, 55%)" },
        { name: "Follow-up", count: inFollowUpCount, value: inFollowUpValue, color: "hsl(38, 92%, 50%)" },
        { name: "Ready", count: readyCount, value: readyValue, color: "hsl(217, 91%, 60%)" },
        { name: "Won", count: dealsCount, value: mtdContractValue, color: "hsl(142, 69%, 45%)" },
      ];

      // Process forecast based on ACTUAL contract values from interested/unsure discoveries
      // Only show deals that have real contract_value set
      const forecast: ForecastRow[] = [];
      
      // Get actual deals in pipeline with contract values
      const dealsWithContractValue = inFollowUpCalls.filter((pitchCall) => (pitchCall.contract_value || 0) > 0);
      const totalPipelineValue = dealsWithContractValue.reduce((sum, pitchCall) => sum + (pitchCall.contract_value || 0), 0);
      const avgContractValue = dealsWithContractValue.length > 0 
        ? Math.round(totalPipelineValue / dealsWithContractValue.length) 
        : 0;
      
      for (let i = 0; i < 3; i++) {
        const monthDate = addMonths(today, i);
        const monthLabel = format(monthDate, "MMM yyyy");
        
        // Only show expecting to close if we have actual deals with contract values
        const expectingToClose = i === 0 ? dealsWithContractValue.length : 0;
        const forecastedValue = expectingToClose * avgContractValue;
        
        forecast.push({
          month: monthLabel,
          contractValue: avgContractValue,
          expectingToClose,
          forecastedValue,
        });
      }

      const todaysFocus: TodaysFocus = {
        discoveryCallsToday: accessibleTodayMeetingsResult.data?.length || 0,
        followUpCallsToday: todayFollowUpsCount,
        actionRequired: overdueCount + todayFollowUpsCount,
        overdueOutcomes: overdueCount,
      };

      // Process quick pulse
      const allMeetingsCount = ownedMonthMeetingsResult.data?.length || 0;
      const satCount = ownedSatLogs.length;
      const showUpRate = allMeetingsCount > 0 ? Math.round((satCount / allMeetingsCount) * 100) : 0;
      const closeRateDenominator = inFollowUpCount + readyCount + dealsCount;
      const closeRate = closeRateDenominator > 0 ? Math.round((dealsCount / closeRateDenominator) * 100) : 0;

      const quickPulse: QuickPulse = {
        showUpRate,
        closeRate,
        mtdValue: mtdContractValue,
      };

      // Process active pipeline items
      const activePipeline: PipelineItem[] = activePitchCalls.slice(0, 10).map(item => {
        const stage: "discovery" | "follow_up" | "ready" | "won" = item.converted_to_client ? "won" : 
          item.status === "completed" ? "ready" : "follow_up";

        return {
          id: item.id,
          company: item.client_name || "Unknown",
          client: item.client_name || "Unknown",
          value: item.contract_value || 0,
          stage,
          date: item.pitch_call_date,
        };
      });

      setData({
        profile: {
          name: "",
          mtdContractValue,
          dealsCount,
          leaderboardPosition: dealsCount > 0 ? 1 : null,
        },
        pipeline,
        forecast,
        todaysFocus,
        quickPulse,
        activePipeline,
        isLoading: false,
        error: null,
        hasOverride: false,
      });
    } catch (error) {
      console.error("Error loading AE dashboard data:", error);
      setData(prev => ({
        ...prev,
        isLoading: false,
        error: "Failed to load dashboard data",
      }));
    }
  }, [subjectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { ...data, refresh: loadData };
}
