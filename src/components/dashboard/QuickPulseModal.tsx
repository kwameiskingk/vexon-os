import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Target, PoundSterling, Users, Calendar, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getUniqueConvertedDeals, getUniqueRecentWins, sumConvertedDealValue } from "@/lib/convertedDeals";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface MetricDetail {
  label: string;
  currentValue: number;
  previousValue: number;
  currentPeriod: string;
  previousPeriod: string;
  format: "percentage" | "currency" | "number";
  breakdown?: { label: string; value: number }[];
}

interface QuickPulseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickPulseModal({ open, onOpenChange }: QuickPulseModalProps) {
  const [metrics, setMetrics] = useState<MetricDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open) {
      loadDetailedMetrics();
    }
  }, [open]);

  const loadDetailedMetrics = async () => {
    setIsLoading(true);
    const today = new Date();
    
    // Current week
    const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
    
    // Previous week
    const prevWeekStart = format(startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const prevWeekEnd = format(endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }), "yyyy-MM-dd");
    
    // Current month
    const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");
    
    // Previous month
    const prevMonthStart = format(startOfMonth(subMonths(today, 1)), "yyyy-MM-dd");
    const prevMonthEnd = format(endOfMonth(subMonths(today, 1)), "yyyy-MM-dd");

    // Show-up Rate calculations
    const { data: weekMeetings } = await supabase
      .from("meetings")
      .select("id")
      .eq("department", "acquisition")
      .gte("meeting_date", weekStart)
      .lte("meeting_date", weekEnd);

    const { data: weekSat } = await supabase
      .from("sales_discovery_logs")
      .select("id")
      .eq("outcome", "sat")
      .gte("meeting_at", `${weekStart}T00:00:00`)
      .lte("meeting_at", `${weekEnd}T23:59:59`);

    const { data: prevWeekMeetings } = await supabase
      .from("meetings")
      .select("id")
      .eq("department", "acquisition")
      .gte("meeting_date", prevWeekStart)
      .lte("meeting_date", prevWeekEnd);

    const { data: prevWeekSat } = await supabase
      .from("sales_discovery_logs")
      .select("id")
      .eq("outcome", "sat")
      .gte("meeting_at", `${prevWeekStart}T00:00:00`)
      .lte("meeting_at", `${prevWeekEnd}T23:59:59`);

    const totalWeekMeetings = weekMeetings?.length || 0;
    const satWeekMeetings = weekSat?.length || 0;
    const showUpRate = totalWeekMeetings > 0 ? Math.round((satWeekMeetings / totalWeekMeetings) * 100) : 0;

    const totalPrevWeekMeetings = prevWeekMeetings?.length || 0;
    const satPrevWeekMeetings = prevWeekSat?.length || 0;
    const prevShowUpRate = totalPrevWeekMeetings > 0 ? Math.round((satPrevWeekMeetings / totalPrevWeekMeetings) * 100) : 0;

    const [
      monthFollowupsResult,
      monthClosesDiscoveryResult,
      monthClosesPitchResult,
      prevMonthFollowupsResult,
      prevMonthClosesDiscoveryResult,
      prevMonthClosesPitchResult,
    ] = await Promise.all([
      supabase
        .from("sales_discovery_logs")
        .select("id")
        .in("client_interest", ["interested", "unsure"])
        .gte("meeting_at", `${monthStart}T00:00:00`)
        .lte("meeting_at", `${monthEnd}T23:59:59`),
      supabase
        .from("sales_discovery_logs")
        .select("id, client_name, contract_value, updated_at")
        .eq("converted_to_client", true)
        .gte("updated_at", `${monthStart}T00:00:00`)
        .lte("updated_at", `${monthEnd}T23:59:59`),
      supabase
        .from("pitch_calls")
        .select("id, discovery_log_id, client_name, company_name, contract_value, updated_at")
        .eq("converted_to_client", true)
        .gte("updated_at", `${monthStart}T00:00:00`)
        .lte("updated_at", `${monthEnd}T23:59:59`),
      supabase
        .from("sales_discovery_logs")
        .select("id")
        .in("client_interest", ["interested", "unsure"])
        .gte("meeting_at", `${prevMonthStart}T00:00:00`)
        .lte("meeting_at", `${prevMonthEnd}T23:59:59`),
      supabase
        .from("sales_discovery_logs")
        .select("id, client_name, contract_value, updated_at")
        .eq("converted_to_client", true)
        .gte("updated_at", `${prevMonthStart}T00:00:00`)
        .lte("updated_at", `${prevMonthEnd}T23:59:59`),
      supabase
        .from("pitch_calls")
        .select("id, discovery_log_id, client_name, company_name, contract_value, updated_at")
        .eq("converted_to_client", true)
        .gte("updated_at", `${prevMonthStart}T00:00:00`)
        .lte("updated_at", `${prevMonthEnd}T23:59:59`),
    ]);

    const totalFollowups = monthFollowupsResult.data?.length || 0;
    const uniqueCurrentDeals = getUniqueConvertedDeals(
      monthClosesPitchResult.data || [],
      monthClosesDiscoveryResult.data || [],
    );
    const totalCloses = uniqueCurrentDeals.length;
    const closeRate = totalFollowups > 0 ? Math.round((totalCloses / totalFollowups) * 100) : 0;

    const prevTotalFollowups = prevMonthFollowupsResult.data?.length || 0;
    const uniquePreviousDeals = getUniqueConvertedDeals(
      prevMonthClosesPitchResult.data || [],
      prevMonthClosesDiscoveryResult.data || [],
    );
    const prevTotalCloses = uniquePreviousDeals.length;
    const prevCloseRate = prevTotalFollowups > 0 ? Math.round((prevTotalCloses / prevTotalFollowups) * 100) : 0;

    const totalContractValue = sumConvertedDealValue(uniqueCurrentDeals);
    const prevTotalContractValue = sumConvertedDealValue(uniquePreviousDeals);

    const contractBreakdown = getUniqueRecentWins(
      monthClosesPitchResult.data || [],
      monthClosesDiscoveryResult.data || [],
    )
      .filter((win) => win.contractValue > 0)
      .map((win) => ({
        label: win.companyName || win.clientName || "Closed Deal",
        value: win.contractValue,
      }));

    setMetrics([
      {
        label: "Show-up Rate",
        currentValue: showUpRate,
        previousValue: prevShowUpRate,
        currentPeriod: "This Week",
        previousPeriod: "Last Week",
        format: "percentage",
        breakdown: [
          { label: "Total Meetings", value: totalWeekMeetings },
          { label: "Attended (Sat)", value: satWeekMeetings },
        ],
      },
      {
        label: "Close Rate",
        currentValue: closeRate,
        previousValue: prevCloseRate,
        currentPeriod: "This Month",
        previousPeriod: "Last Month",
        format: "percentage",
        breakdown: [
          { label: "Qualified Follow-ups", value: totalFollowups },
          { label: "Converted to Client", value: totalCloses },
        ],
      },
      {
        label: "Contract Value",
        currentValue: totalContractValue,
        previousValue: prevTotalContractValue,
        currentPeriod: "This Month",
        previousPeriod: "Last Month",
        format: "currency",
        breakdown: contractBreakdown.length > 0 ? contractBreakdown : undefined,
      },
    ]);

    setIsLoading(false);
  };

  const formatValue = (value: number, formatType: string) => {
    if (formatType === "percentage") return `${value}%`;
    if (formatType === "currency") {
      if (value >= 1000) return `£${(value / 1000).toFixed(1)}k`;
      return `£${value.toLocaleString()}`;
    }
    return value.toString();
  };

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) return <ArrowUp className="h-4 w-4 text-emerald-500" />;
    if (current < previous) return <ArrowDown className="h-4 w-4 text-destructive" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getTrendColor = (current: number, previous: number) => {
    if (current > previous) return "text-emerald-500";
    if (current < previous) return "text-destructive";
    return "text-muted-foreground";
  };

  const getIcon = (label: string) => {
    switch (label) {
      case "Show-up Rate":
        return <Target className="h-5 w-5 text-primary" />;
      case "Close Rate":
        return <Users className="h-5 w-5 text-primary" />;
      case "Contract Value":
        return <PoundSterling className="h-5 w-5 text-primary" />;
      default:
        return <TrendingUp className="h-5 w-5 text-primary" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Quick Pulse - Detailed View
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {metrics.map((metric) => (
              <div key={metric.label} className="p-4 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                      {getIcon(metric.label)}
                    </div>
                    <div>
                      <p className="font-semibold text-lg">{metric.label}</p>
                      <p className="text-xs text-muted-foreground">{metric.currentPeriod}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${getTrendColor(metric.currentValue, metric.previousValue)}`}>
                      {formatValue(metric.currentValue, metric.format)}
                    </p>
                    <div className="flex items-center justify-end gap-1 text-sm">
                      {getTrendIcon(metric.currentValue, metric.previousValue)}
                      <span className="text-muted-foreground">
                        vs {formatValue(metric.previousValue, metric.format)} {metric.previousPeriod}
                      </span>
                    </div>
                  </div>
                </div>

                {metric.breakdown && metric.breakdown.length > 0 && (
                  <div className="pt-3 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Breakdown</p>
                    <div className="grid grid-cols-2 gap-2">
                      {metric.breakdown.map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-2 rounded bg-background">
                          <span className="text-sm text-muted-foreground">{item.label}</span>
                          <span className="text-sm font-medium">
                            {metric.format === "currency" ? formatValue(item.value, "currency") : item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
