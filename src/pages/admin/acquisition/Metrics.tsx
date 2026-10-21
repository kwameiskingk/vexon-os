import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/dashboard/KPICard";
import { KPICardSkeleton } from "@/components/dashboard/KPICardSkeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getUniqueConvertedDeals, sumConvertedDealValue } from "@/lib/convertedDeals";
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import {
  Calendar,
  CheckCircle,
  Phone,
  XCircle,
  Target,
  UserCheck,
  TrendingUp,
  FileCheck,
  PoundSterling,
} from "lucide-react";
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
  Funnel,
  FunnelChart,
  LabelList,
} from "recharts";

export default function Metrics() {
  const [selectedPeriod, setSelectedPeriod] = useState("this_month");
  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    loadMetrics();
  }, [selectedPeriod]);

  const getDateRange = () => {
    const today = new Date();
    switch (selectedPeriod) {
      case "this_week":
        return {
          start: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
          end: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        };
      case "last_month": {
        const lastMonth = subMonths(today, 1);
        return {
          start: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
          end: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
        };
      }
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

    // Total Discovery
    const { data: allMeetings } = await supabase
      .from("meetings")
      .select("id")
      .eq("department", "acquisition")
      .gte("meeting_date", start)
      .lte("meeting_date", end);
    const totalDiscoveryCount = allMeetings?.length || 0;
    setTotalDiscovery(totalDiscoveryCount);

    // Qualified Discovery
    const { data: qualifiedDiscoveryData } = await supabase
      .from("sales_discovery_logs")
      .select("id")
      .eq("outcome", "sat")
      .gte("meeting_at", `${start}T00:00:00`)
      .lte("meeting_at", `${end}T23:59:59`);
    const qualifiedCount = qualifiedDiscoveryData?.length || 0;
    setQualifiedDiscovery(qualifiedCount);

    // Lead Follow-ups
    const { data: leadFollowupsData } = await supabase
      .from("sales_discovery_logs")
      .select("id")
      .in("client_interest", ["interested", "unsure"])
      .gte("meeting_at", `${start}T00:00:00`)
      .lte("meeting_at", `${end}T23:59:59`);
    const leadFollowupCount = leadFollowupsData?.length || 0;
    setLeadFollowups(leadFollowupCount);

    // No Shows
    const { data: noShowsData } = await supabase
      .from("sales_discovery_logs")
      .select("id")
      .eq("outcome", "no_show")
      .gte("meeting_at", `${start}T00:00:00`)
      .lte("meeting_at", `${end}T23:59:59`);
    const noShowCount = noShowsData?.length || 0;
    setNoShows(noShowCount);

    // Show-up Rate
    const showUpRateCalc = totalDiscoveryCount > 0
      ? Math.round((qualifiedCount / totalDiscoveryCount) * 100)
      : 0;
    setShowUpRate(showUpRateCalc);

    // Total Closes / Contract Value
    const [convertedFromPitchResult, convertedFromDiscoveryResult] = await Promise.all([
      supabase
        .from("pitch_calls")
        .select("id, discovery_log_id, contract_value, updated_at")
        .eq("converted_to_client", true)
        .gte("updated_at", `${start}T00:00:00`)
        .lte("updated_at", `${end}T23:59:59`),
      supabase
        .from("sales_discovery_logs")
        .select("id, contract_value, updated_at")
        .eq("converted_to_client", true)
        .gte("updated_at", `${start}T00:00:00`)
        .lte("updated_at", `${end}T23:59:59`),
    ]);

    const uniqueConvertedDeals = getUniqueConvertedDeals(
      convertedFromPitchResult.data || [],
      convertedFromDiscoveryResult.data || [],
    );
    const totalClosesCount = uniqueConvertedDeals.length;
    setTotalCloses(totalClosesCount);

    // Percentages
    setQDiscToFollowUpPct(qualifiedCount > 0 ? Math.round((leadFollowupCount / qualifiedCount) * 100) : 0);
    setFollowUpToClosePct(leadFollowupCount > 0 ? Math.round((totalClosesCount / leadFollowupCount) * 100) : 0);

    setTotalContractValue(sumConvertedDealValue(uniqueConvertedDeals));

    // Cash Collected (placeholder - accounting_records may not have paid_at)
    setTotalCashCollected(0);

    // Update funnel data
    setFunnelData([
      { name: "Total Discovery", value: totalDiscoveryCount, fill: "hsl(var(--primary))" },
      { name: "Qualified", value: qualifiedCount, fill: "hsl(var(--chart-2))" },
      { name: "Lead Follow-ups", value: leadFollowupCount, fill: "hsl(var(--chart-3))" },
      { name: "Closes", value: totalClosesCount, fill: "hsl(var(--chart-4))" },
    ]);

    // Load trend data
    await loadTrendData();

    setIsLoading(false);
  };

  const loadTrendData = async () => {
    const today = new Date();
    const weeks: any[] = [];
    const showUpWeeks: any[] = [];
    const revenueMonths: any[] = [];

    // Discovery volume - last 8 weeks
    for (let i = 7; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(subWeeks(today, i), { weekStartsOn: 1 });

      const { data: weekMeetings } = await supabase
        .from("meetings")
        .select("id")
        .eq("department", "acquisition")
        .gte("meeting_date", format(weekStart, "yyyy-MM-dd"))
        .lte("meeting_date", format(weekEnd, "yyyy-MM-dd"));

      const { data: weekSat } = await supabase
        .from("sales_discovery_logs")
        .select("id")
        .eq("outcome", "sat")
        .gte("meeting_at", `${format(weekStart, "yyyy-MM-dd")}T00:00:00`)
        .lte("meeting_at", `${format(weekEnd, "yyyy-MM-dd")}T23:59:59`);

      const weekLabel = format(weekStart, "MMM d");
      const total = weekMeetings?.length || 0;
      const sat = weekSat?.length || 0;

      weeks.push({ week: weekLabel, discoveries: total });
      showUpWeeks.push({
        week: weekLabel,
        rate: total > 0 ? Math.round((sat / total) * 100) : 0,
      });
    }

    setDiscoveryTrend(weeks);
    setShowUpTrend(showUpWeeks);

    // Revenue trend - last 6 months
    for (let i = 5; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(today, i));
      const monthEnd = endOfMonth(subMonths(today, i));

      const [monthClosesResult, pitchClosesResult] = await Promise.all([
        supabase
          .from("sales_discovery_logs")
          .select("id, contract_value, updated_at")
          .eq("converted_to_client", true)
          .gte("updated_at", `${format(monthStart, "yyyy-MM-dd")}T00:00:00`)
          .lte("updated_at", `${format(monthEnd, "yyyy-MM-dd")}T23:59:59`),
        supabase
          .from("pitch_calls")
          .select("id, discovery_log_id, contract_value, updated_at")
          .eq("converted_to_client", true)
          .gte("updated_at", `${format(monthStart, "yyyy-MM-dd")}T00:00:00`)
          .lte("updated_at", `${format(monthEnd, "yyyy-MM-dd")}T23:59:59`),
      ]);

      const uniqueMonthCloses = getUniqueConvertedDeals(
        pitchClosesResult.data || [],
        monthClosesResult.data || [],
      );

      revenueMonths.push({
        month: format(monthStart, "MMM"),
        value: sumConvertedDealValue(uniqueMonthCloses),
      });
    }

    setRevenueTrend(revenueMonths);
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `£${(value / 1000).toFixed(1)}k`;
    }
    return `£${value.toLocaleString()}`;
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Sales Metrics"
          subtitle="In-depth analytics and performance tracking"
          actions={
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
          }
        />

        <div className="space-y-6 animate-fade-in">
          {/* KPI Cards - All 10 */}
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                <KPICardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <KPICard title="Total Discovery" value={totalDiscovery} icon={Calendar} />
                <KPICard title="Qualified Discovery" value={qualifiedDiscovery} icon={CheckCircle} />
                <KPICard title="Lead Follow-ups" value={leadFollowups} icon={Phone} />
                <KPICard title="No Shows" value={noShows} icon={XCircle} />
                <KPICard title="Show-up Rate" value={`${showUpRate}%`} icon={Target} />
                <KPICard title="Total Closes" value={totalCloses} icon={UserCheck} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard title="Q. Disc to Follow-up %" value={`${qDiscToFollowUpPct}%`} icon={TrendingUp} />
                <KPICard title="Follow-up to Close %" value={`${followUpToClosePct}%`} icon={FileCheck} />
                <KPICard title="Cash Collected" value={formatCurrency(totalCashCollected)} icon={PoundSterling} />
                <KPICard title="Contract Value" value={formatCurrency(totalContractValue)} icon={PoundSterling} />
              </div>
            </div>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales Funnel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sales Funnel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {funnelData.length > 0 && funnelData[0].value > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={funnelData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(value) => [value, "Count"]} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {funnelData.map((entry, index) => (
                            <Bar key={`bar-${index}`} dataKey="value" fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      No funnel data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Show-up Rate Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Show-up Rate Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={showUpTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                      <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value) => [`${value}%`, "Show-up Rate"]} />
                      <Line
                        type="monotone"
                        dataKey="rate"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: "hsl(var(--primary))" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Second Row Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Discovery Volume */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Discovery Volume (8 Weeks)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={discoveryTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value) => [value, "Discoveries"]} />
                      <Bar dataKey="discoveries" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Revenue Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue Trend (6 Months)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(value) => `£${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip formatter={(value: number) => [formatCurrency(value), "Contract Value"]} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--chart-4))"
                        fill="hsl(var(--chart-4) / 0.2)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
