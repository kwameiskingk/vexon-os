import { useEffect, useState, type ReactNode } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ButtonV2, Eyebrow, Panel, Pill, StatStrip } from "@/components/ui-v2";
import { supabase } from "@/integrations/supabase/client";
import { getUniqueConvertedDeals, sumConvertedDealValue } from "@/lib/convertedDeals";
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { RefreshCw } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { CompanyPipelineView } from "@/components/ae/CompanyPipelineView";
import { Skeleton } from "@/components/ui/skeleton";
import { useAEMetricsOverridesInRange, aggregateOverrideMetrics } from "@/hooks/useAEMetricsOverrides";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

export default function AEMetrics() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState("this_month");
  const [isLoading, setIsLoading] = useState(true);
  const [hasOverride, setHasOverride] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // KPIs
  const [totalDiscovery, setTotalDiscovery] = useState(0);
  const [qualifiedDiscovery, setQualifiedDiscovery] = useState(0);
  const [leadFollowups, setLeadFollowups] = useState(0);
  const [noShows, setNoShows] = useState(0);
  const [showUpRate, setShowUpRate] = useState(0);
  const [totalCloses, setTotalCloses] = useState(0);
  const [qDiscToFollowUpPct, setQDiscToFollowUpPct] = useState(0);
  const [followUpToClosePct, setFollowUpToClosePct] = useState(0);
  const [totalCashCollected, setTotalCashCollected] = useState(0);
  const [totalContractValue, setTotalContractValue] = useState(0);

  // Chart data
  const [funnelData, setFunnelData] = useState<any[]>([]);
  const [discoveryTrend, setDiscoveryTrend] = useState<any[]>([]);
  const [showUpTrend, setShowUpTrend] = useState<any[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<any[]>([]);

  // Get current date range for override check
  const getDateRangeObj = () => {
    const today = new Date();
    switch (selectedPeriod) {
      case "this_week":
        return {
          start: startOfWeek(today, { weekStartsOn: 1 }),
          end: endOfWeek(today, { weekStartsOn: 1 }),
        };
      case "last_month":
        const lastMonth = subMonths(today, 1);
        return {
          start: startOfMonth(lastMonth),
          end: endOfMonth(lastMonth),
        };
      case "this_month":
      default:
        return {
          start: startOfMonth(today),
          end: endOfMonth(today),
        };
    }
  };

  const dateRange = getDateRangeObj();
  
  // Fetch any overrides for the current period - filtered by current user
  const { data: overrides, refetch: refetchOverrides } = useAEMetricsOverridesInRange(dateRange.start, dateRange.end, user?.id);

  useEffect(() => {
    loadMetrics();
  }, [selectedPeriod, overrides]);

  // Refresh on mount to always show latest data
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["ae-metrics-overrides-range"] });
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["ae-metrics-overrides-range"] });
    await refetchOverrides();
    await loadMetrics();
    setIsRefreshing(false);
  };

  const getDateRange = () => {
    const today = new Date();
    switch (selectedPeriod) {
      case "this_week":
        return {
          start: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
          end: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        };
      case "last_month":
        const lastMonth = subMonths(today, 1);
        return {
          start: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
          end: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
        };
      case "this_month":
      default:
        return {
          start: format(startOfMonth(today), "yyyy-MM-dd"),
          end: format(endOfMonth(today), "yyyy-MM-dd"),
        };
    }
  };

  const loadMetrics = async () => {
    setIsLoading(true);
    const { start, end } = getDateRange();

    try {
      // Check if we have override data for this period
      if (overrides && overrides.length > 0) {
        const aggregated = aggregateOverrideMetrics(overrides);
        
        setHasOverride(true);
        setTotalDiscovery(aggregated.totalDiscovery);
        setQualifiedDiscovery(aggregated.qualifiedDiscovery);
        setLeadFollowups(aggregated.leadFollowups);
        setNoShows(aggregated.noShows);
        setShowUpRate(aggregated.totalDiscovery > 0 ? Math.round((aggregated.qualifiedDiscovery / aggregated.totalDiscovery) * 100) : 0);
        setTotalCloses(aggregated.totalCloses);
        setQDiscToFollowUpPct(aggregated.qualifiedDiscovery > 0 ? Math.round((aggregated.leadFollowups / aggregated.qualifiedDiscovery) * 100) : 0);
        setFollowUpToClosePct(aggregated.leadFollowups > 0 ? Math.round((aggregated.totalCloses / aggregated.leadFollowups) * 100) : 0);
        setTotalContractValue(aggregated.contractValue);
        setTotalCashCollected(aggregated.cashCollected);

        // Update funnel data with override values
        setFunnelData([
          { name: "Total Discovery", value: aggregated.totalDiscovery, fill: "hsl(var(--primary))" },
          { name: "Qualified", value: aggregated.qualifiedDiscovery, fill: "hsl(var(--chart-2))" },
          { name: "Lead Follow-ups", value: aggregated.leadFollowups, fill: "hsl(var(--chart-3))" },
          { name: "Closes", value: aggregated.totalCloses, fill: "hsl(var(--chart-4))" },
        ]);

        // Still load trend data from actual tables
        await loadTrendData();
        setIsLoading(false);
        return;
      }

      // No override - load from actual tables
      setHasOverride(false);

      const userId = user?.id;
      
      // Step 1: Get this AE's meeting IDs for the period to scope discovery logs
      const { data: aeMeetings } = await supabase
        .from("meetings")
        .select("id")
        .eq("department", "acquisition")
        .eq("assigned_ae_id", userId!)
        .gte("meeting_date", start)
        .lte("meeting_date", end);

      const aeMeetingIds = (aeMeetings || []).map(m => m.id);
      const totalDiscoveryCount = aeMeetingIds.length;

      // Step 2: Get discovery logs and pitch calls scoped to this AE
      let qualifiedCount = 0;
      let leadFollowupCount = 0;
      let noShowCount = 0;
      let aeDiscoveryLogs: any[] = [];
      let aePitchCalls: any[] = [];

      if (aeMeetingIds.length > 0) {
        const [discoveryLogsResult, pitchCallsResult] = await Promise.all([
          supabase
            .from("sales_discovery_logs")
            .select("id, outcome, client_interest, contract_value, converted_to_client, updated_at, meeting_id, cash_collected_ex_vat")
            .in("meeting_id", aeMeetingIds),
          supabase
            .from("pitch_calls")
            .select("id, discovery_log_id, contract_value, converted_to_client, updated_at, cash_collected_ex_vat")
            .eq("created_by", userId!),
        ]);

        aeDiscoveryLogs = discoveryLogsResult.data || [];
        aePitchCalls = pitchCallsResult.data || [];

        qualifiedCount = aeDiscoveryLogs.filter(l => l.outcome === "sat").length;
        leadFollowupCount = aeDiscoveryLogs.filter(l => ["interested", "unsure"].includes(l.client_interest)).length;
        noShowCount = aeDiscoveryLogs.filter(l => l.outcome === "no_show").length;
      } else {
        // Still check for pitch calls by this AE even without meetings
        const { data: pitchCallsData } = await supabase
          .from("pitch_calls")
          .select("id, discovery_log_id, contract_value, converted_to_client, updated_at, cash_collected_ex_vat")
          .eq("created_by", userId!);
        aePitchCalls = pitchCallsData || [];
      }

      // Step 3: Deduplicate closes using the utility
      const convertedPitch = aePitchCalls.filter(p => 
        p.converted_to_client && p.updated_at >= `${start}T00:00:00` && p.updated_at <= `${end}T23:59:59`
      );
      const convertedDiscovery = aeDiscoveryLogs.filter(l => 
        l.converted_to_client && l.updated_at >= `${start}T00:00:00` && l.updated_at <= `${end}T23:59:59`
      );
      const uniqueDeals = getUniqueConvertedDeals(convertedPitch, convertedDiscovery);
      const totalClosesCount = uniqueDeals.length;
      const totalValue = sumConvertedDealValue(uniqueDeals);

      // Set all state values
      setTotalDiscovery(totalDiscoveryCount);
      setQualifiedDiscovery(qualifiedCount);
      setLeadFollowups(leadFollowupCount);
      setNoShows(noShowCount);
      setShowUpRate(totalDiscoveryCount > 0 ? Math.round((qualifiedCount / totalDiscoveryCount) * 100) : 0);
      setTotalCloses(totalClosesCount);
      setQDiscToFollowUpPct(qualifiedCount > 0 ? Math.round((leadFollowupCount / qualifiedCount) * 100) : 0);
      setFollowUpToClosePct(leadFollowupCount > 0 ? Math.round((totalClosesCount / leadFollowupCount) * 100) : 0);

      // W15: Contract Value and Cash Collected are DIFFERENT numbers.
      // Cash = cash_collected_ex_vat (the canonical, CEO-tile definition);
      // contract value stays the total deal size.
      setTotalContractValue(totalValue);
      setTotalCashCollected(
        uniqueDeals.reduce(
          (s: number, d: any) => s + Number(d.cash_collected_ex_vat || 0),
          0,
        ),
      );

      // Update funnel data
      setFunnelData([
        { name: "Total Discovery", value: totalDiscoveryCount, fill: "hsl(var(--primary))" },
        { name: "Qualified", value: qualifiedCount, fill: "hsl(var(--chart-2))" },
        { name: "Lead Follow-ups", value: leadFollowupCount, fill: "hsl(var(--chart-3))" },
        { name: "Closes", value: totalClosesCount, fill: "hsl(var(--chart-4))" },
      ]);

      // Load trend data in parallel
      await loadTrendData();
    } catch (error) {
      console.error("Error loading metrics:", error);
    }
    
    setIsLoading(false);
  };

  const loadTrendData = async () => {
    const today = new Date();

    // Build all week date ranges upfront
    const weekDates: { start: string; end: string; label: string }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
      weekDates.push({
        start: format(weekStart, "yyyy-MM-dd"),
        end: format(weekEnd, "yyyy-MM-dd"),
        label: format(weekStart, "MMM d"),
      });
    }

    // Build all month date ranges upfront
    const monthDates: { start: string; end: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(today, i));
      const monthEnd = endOfMonth(subMonths(today, i));
      monthDates.push({
        start: format(monthStart, "yyyy-MM-dd"),
        end: format(monthEnd, "yyyy-MM-dd"),
        label: format(monthStart, "MMM"),
      });
    }

    // Execute ALL queries in parallel using Promise.all
    const userId = user?.id;

    const weekMeetingsPromises = weekDates.map(w =>
      supabase
        .from("meetings")
        .select("id")
        .eq("department", "acquisition")
        .eq("assigned_ae_id", userId!)
        .gte("meeting_date", w.start)
        .lte("meeting_date", w.end)
    );

    const weekSatPromises = weekDates.map(w =>
      supabase
        .from("sales_discovery_logs")
        .select("id, meeting_id")
        .eq("outcome", "sat")
        .gte("meeting_at", `${w.start}T00:00:00`)
        .lte("meeting_at", `${w.end}T23:59:59`)
    );

    const monthPitchPromises = monthDates.map(m =>
      supabase
        .from("pitch_calls")
        .select("contract_value")
        .eq("converted_to_client", true)
        .eq("created_by", userId!)
        .gte("updated_at", `${m.start}T00:00:00`)
        .lte("updated_at", `${m.end}T23:59:59`)
    );

    const [weekMeetingsResults, weekSatResults, monthPitchResults] = await Promise.all([
      Promise.all(weekMeetingsPromises),
      Promise.all(weekSatPromises),
      Promise.all(monthPitchPromises),
    ]);

    // Process week results
    const weeks: any[] = [];
    const showUpWeeks: any[] = [];

    for (let i = 0; i < weekDates.length; i++) {
      const total = weekMeetingsResults[i].data?.length || 0;
      // Filter sat results to only count those whose meeting_id is in this AE's meetings
      const aeMeetingIdsForWeek = new Set((weekMeetingsResults[i].data || []).map((m: any) => m.id));
      const sat = (weekSatResults[i].data || []).filter((l: any) => aeMeetingIdsForWeek.has(l.meeting_id)).length;

      weeks.push({ week: weekDates[i].label, discoveries: total });
      showUpWeeks.push({ week: weekDates[i].label, rate: total > 0 ? Math.round((sat / total) * 100) : 0, target: 70 });
    }

    setDiscoveryTrend(weeks);
    setShowUpTrend(showUpWeeks);

    // Process month results - only pitch calls scoped to AE (primary source of truth)
    const revenueMonths: any[] = [];

    for (let i = 0; i < monthDates.length; i++) {
      const pitchTotal = monthPitchResults[i].data?.reduce((sum: number, c: any) => sum + (c.contract_value || 0), 0) || 0;
      revenueMonths.push({ month: monthDates[i].label, value: pitchTotal });
    }

    setRevenueTrend(revenueMonths);
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000) return `£${(value / 1000).toFixed(1)}k`;
    return `£${value.toLocaleString()}`;
  };

  // Semantic tone for a rate against its target (same thresholds as before:
  // at or above = ok, within 70% of target = warn, otherwise bad).
  const tone = (value: number, threshold: number) =>
    value >= threshold ? "text-[var(--ok)]" : value >= threshold * 0.7 ? "text-[var(--warn)]" : "text-[var(--bad)]";

  const toned = (value: ReactNode, className?: string) => (className ? <span className={className}>{value}</span> : value);

  /** Flat tonal tile: surf2 ground, radius 8, mono label, Bricolage numeral. */
  const MetricTile = ({ label, value, caption, className }: { label: string; value: string | number; caption?: string; className?: string }) => (
    <div className="rounded-[8px] bg-[var(--surf2)] px-4 py-[14px]">
      <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">{label}</span>
      <b className={`block font-head text-[28px] font-[450] leading-none tracking-[-0.03em] ${className || ""}`}>{value}</b>
      {caption && <small className="mt-2 block text-[11.5px] text-[var(--dim)]">{caption}</small>}
    </div>
  );

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Sales Metrics"
          subtitle="In-depth analytics and performance tracking"
          actions={
            <div className="flex items-center gap-3">
              {hasOverride && <Pill variant="warn">Using override data</Pill>}
              <ButtonV2
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                aria-label="Refresh metrics"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              </ButtonV2>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />

        <div className="space-y-7">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <>
              {/* Discovery performance */}
              <Panel title="Discovery performance">
                <StatStrip
                  className="pt-4"
                  stats={[
                    { label: "Total discovery", value: totalDiscovery, caption: "All scheduled meetings" },
                    { label: "Qualified", value: toned(qualifiedDiscovery, "text-[var(--ok)]"), caption: "Completed discovery calls" },
                    { label: "No shows", value: toned(noShows, noShows > 0 ? "text-[var(--bad)]" : undefined), caption: "Missed meetings" },
                    { label: "Show-up rate", value: toned(`${showUpRate}%`, tone(showUpRate, 70)), caption: "Target: 70%" },
                  ]}
                />
              </Panel>

              {/* Pipeline & conversion */}
              <Panel title="Pipeline & conversion">
                <StatStrip
                  className="pt-4"
                  stats={[
                    { label: "Warm lead follow-ups", value: leadFollowups, caption: "Interested/Unsure warm leads" },
                    { label: "Total closes", value: toned(totalCloses, "text-[var(--ok)]"), caption: "Converted to client" },
                    { label: "Qual → Follow-up", value: `${qDiscToFollowUpPct}%`, caption: "Conversion rate" },
                    { label: "Follow-up → Close", value: toned(`${followUpToClosePct}%`, tone(followUpToClosePct, 30)), caption: "Closing rate" },
                  ]}
                />
              </Panel>

              {/* Revenue */}
              <Panel title="Revenue">
                <div className="grid grid-cols-1 gap-3 pt-4 md:grid-cols-2">
                  <MetricTile label="Contract value" value={formatCurrency(totalContractValue)} caption="Total closed value" className="text-[var(--ok)]" />
                  <MetricTile label="Cash collected" value={formatCurrency(totalCashCollected)} caption="Actual payments received" />
                </div>
              </Panel>
            </>
          )}

          {/* Company pipeline */}
          <CompanyPipelineView />

          {/* Trends & analysis */}
          <div className="space-y-6">
            <Eyebrow>Trends &amp; analysis</Eyebrow>

            <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
              <Panel title="Sales funnel">
                <div className="h-64 pt-3">
                  {funnelData.length > 0 && funnelData[0].value > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={funnelData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip formatter={(value) => [value, "Count"]} contentStyle={tooltipStyle} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-[12px] text-[var(--dim)]">
                      No funnel data available
                    </div>
                  )}
                </div>
              </Panel>

              <Panel title="Show-up rate trend" meta="Target: 70%">
                <div className="h-64 pt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={showUpTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip formatter={(value) => [`${value}%`, "Show-up Rate"]} contentStyle={tooltipStyle} />
                      <ReferenceLine y={70} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" label={{ value: "Target", position: "right", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Line
                        type="monotone"
                        dataKey="rate"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: "hsl(var(--primary))", strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>

            <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
              <Panel title="Discovery volume" meta="Last 8 weeks">
                <div className="h-64 pt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={discoveryTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip formatter={(value) => [value, "Discoveries"]} contentStyle={tooltipStyle} />
                      <Bar dataKey="discoveries" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="Revenue trend" meta="Last 6 months">
                <div className="h-64 pt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(value) => `£${(value / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => [formatCurrency(value), "Contract Value"]} contentStyle={tooltipStyle} />
                      <defs>
                        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(160 60% 45%)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(160 60% 45%)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(160 60% 45%)"
                        fill="url(#revenueGradient)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
