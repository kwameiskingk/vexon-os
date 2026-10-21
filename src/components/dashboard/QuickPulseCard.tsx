import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Target, PoundSterling, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getUniqueConvertedDeals, sumConvertedDealValue } from "@/lib/convertedDeals";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickPulseModal } from "./QuickPulseModal";
import { useAuth } from "@/contexts/AuthContext";

interface PulseMetric {
  label: string;
  value: string;
  subLabel: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
}

export function QuickPulseCard() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const isAE = userRole === 'account_executive';
  
  const [metrics, setMetrics] = useState<PulseMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    setIsLoading(true);
    const today = new Date();
    
    // Week range
    const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
    
    // Month range
    const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");

    // Show-up Rate (This Week)
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

    const totalWeekMeetings = weekMeetings?.length || 0;
    const satWeekMeetings = weekSat?.length || 0;
    const showUpRate = totalWeekMeetings > 0 
      ? Math.round((satWeekMeetings / totalWeekMeetings) * 100) 
      : 0;

    const [monthFollowupsResult, monthClosesDiscoveryResult, monthClosesPitchResult] = await Promise.all([
      supabase
        .from("sales_discovery_logs")
        .select("id")
        .in("client_interest", ["interested", "unsure"])
        .gte("meeting_at", `${monthStart}T00:00:00`)
        .lte("meeting_at", `${monthEnd}T23:59:59`),
      supabase
        .from("sales_discovery_logs")
        .select("id, contract_value, updated_at")
        .eq("converted_to_client", true)
        .gte("updated_at", `${monthStart}T00:00:00`)
        .lte("updated_at", `${monthEnd}T23:59:59`),
      supabase
        .from("pitch_calls")
        .select("id, discovery_log_id, contract_value, updated_at")
        .eq("converted_to_client", true)
        .gte("updated_at", `${monthStart}T00:00:00`)
        .lte("updated_at", `${monthEnd}T23:59:59`),
    ]);

    const totalFollowups = monthFollowupsResult.data?.length || 0;
    const uniqueConvertedDeals = getUniqueConvertedDeals(
      monthClosesPitchResult.data || [],
      monthClosesDiscoveryResult.data || [],
    );
    const totalCloses = uniqueConvertedDeals.length;
    const closeRate = totalFollowups > 0 
      ? Math.round((totalCloses / totalFollowups) * 100) 
      : 0;

    const totalContractValue = sumConvertedDealValue(uniqueConvertedDeals);

    const formatCurrency = (value: number) => {
      if (value >= 1000) {
        return `£${(value / 1000).toFixed(1)}k`;
      }
      return `£${value.toLocaleString()}`;
    };

    setMetrics([
      {
        label: "Show-up Rate",
        value: `${showUpRate}%`,
        subLabel: "This Week",
        icon: Target,
        trend: showUpRate >= 70 ? "up" : showUpRate >= 50 ? "neutral" : "down",
      },
      {
        label: "Close Rate",
        value: `${closeRate}%`,
        subLabel: "This Month",
        icon: Users,
        trend: closeRate >= 40 ? "up" : closeRate >= 20 ? "neutral" : "down",
      },
      {
        label: "Contract Value",
        value: formatCurrency(totalContractValue),
        subLabel: "This Month",
        icon: PoundSterling,
        trend: totalContractValue > 0 ? "up" : "neutral",
      },
    ]);

    setIsLoading(false);
  };

  const getTrendColor = (trend?: string) => {
    switch (trend) {
      case "up":
        return "text-emerald-500";
      case "down":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-semibold">Quick Pulse</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const handleCardClick = () => {
    if (isAE) {
      navigate('/ae/metrics');
    } else {
      setIsModalOpen(true);
    }
  };

  return (
    <>
    <Card className="h-full cursor-pointer hover:shadow-md hover:border-primary/30 transition-all duration-200" onClick={handleCardClick}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10">
            <TrendingUp className="h-4.5 w-4.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">Quick Pulse</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10">
                <metric.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className={`text-lg font-bold ${getTrendColor(metric.trend)}`}>
                  {metric.value}
                </p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{metric.subLabel}</span>
          </div>
        ))}
      </CardContent>
    </Card>
    <QuickPulseModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </>
  );
}
